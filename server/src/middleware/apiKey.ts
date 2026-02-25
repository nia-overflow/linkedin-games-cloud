/**
 * API key middleware — authenticates scraper push requests.
 *
 * Expects: X-API-Key: lgk_<random>
 * Verifies by SHA-256 hashing the key and looking it up in the api_keys table.
 * On success: attaches req.userId, updates last_used_at, calls next().
 * On failure: returns 401.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../supabase.js';

export async function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.headers['x-api-key'] as string | undefined;

  if (!key) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  if (!supabase) {
    res.status(500).json({ error: 'Supabase not configured' });
    return;
  }

  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  // Update last_used_at (fire-and-forget — don't block the request)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {/* best-effort */});

  req.userId = data.user_id;
  next();
}
