#!/usr/bin/env bash
# install-daemons.sh
#
# Installs the LinkedIn Games launchd agents and schedules a Mac wake at 11:55 PM.
# Run this once after setup.
#
# Usage:
#   bash scripts/install-daemons.sh

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}"; }

# ── Resolve paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HOME_DIR="$HOME"
PLIST_DIR="$SCRIPT_DIR/plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOGS_DIR="$HOME/.linkedin-games/logs"
PNPM_PATH="$(which pnpm || echo '/opt/homebrew/bin/pnpm')"
NODE_PATH="$(which node || echo '/opt/homebrew/bin/node')"

echo "LinkedIn Games — Install Daemons"
echo "================================="
echo "Project dir: $PROJECT_DIR"
echo "pnpm:        $PNPM_PATH"
echo "node:        $NODE_PATH"
echo ""

# ── Create logs directory ─────────────────────────────────────────────────────
mkdir -p "$LOGS_DIR"
ok "Logs directory: $LOGS_DIR"

# ── Install plists ────────────────────────────────────────────────────────────
for PLIST_NAME in com.linkedingames.scraper com.linkedingames.server; do
  SRC="$PLIST_DIR/${PLIST_NAME}.plist"
  DST="$LAUNCH_AGENTS_DIR/${PLIST_NAME}.plist"

  # Unload existing agent if running
  if launchctl list | grep -q "$PLIST_NAME" 2>/dev/null; then
    launchctl unload "$DST" 2>/dev/null || true
    warn "Unloaded existing: $PLIST_NAME"
  fi

  # Substitute placeholders
  sed \
    -e "s|LINKEDIN_GAMES_PROJECT_DIR|$PROJECT_DIR|g" \
    -e "s|HOME_DIR|$HOME_DIR|g" \
    -e "s|/opt/homebrew/bin/pnpm|$PNPM_PATH|g" \
    -e "s|/opt/homebrew/bin/node|$NODE_PATH|g" \
    "$SRC" > "$DST"

  # Load the agent
  launchctl load "$DST"
  ok "Installed and loaded: $PLIST_NAME"
done

# ── Schedule Mac wake at 11:55 PM ─────────────────────────────────────────────
echo ""
echo "Scheduling Mac wake at 11:55 PM nightly..."
echo "This requires sudo (for pmset):"

if sudo pmset repeat wakeorpoweron MTWRFSU 23:55:00; then
  ok "Mac will wake at 11:55 PM every day to run the scraper."
else
  warn "pmset failed. Your Mac may need to be plugged in for scheduled wake."
  warn "You can manually set this in: System Settings > Battery > Schedule"
fi

# ── Verify ────────────────────────────────────────────────────────────────────
echo ""
echo "Verification:"
launchctl list | grep linkedingames | while read -r line; do
  echo "  $line"
done

echo ""
echo "pmset schedule:"
pmset -g sched | grep -i "wake\|power" || echo "  (no wake schedule found)"

echo ""
ok "Setup complete!"
echo ""
echo "  Dashboard:  https://linkedin-games-dashboard.up.railway.app"
echo "  Scraper runs at: 11:55 PM daily"
echo "  Logs: $LOGS_DIR"
echo ""
echo "To manually trigger a scrape:"
echo "  launchctl start com.linkedingames.scraper"
