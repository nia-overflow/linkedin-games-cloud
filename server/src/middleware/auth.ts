/**
 * JWT auth middleware — verifies Supabase access tokens.
 *
 * Expects: Authorization: Bearer <supabase_access_token>
 * On success: attaches req.userId (UUID string) and calls next().
 * On failure: returns 401.
 *
 * Only mounted in cloud mode (when SUPABASE_URL is set).
 */

import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase.js';

// Extend Express.Request with our custom property
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <token>' });
    return;
  }

  const token = authHeader.slice(7);

  if (!supabase) {
    // Should never reach here — authMiddleware is only mounted in cloud mode
    res.status(500).json({ error: 'Supabase not configured' });
    return;
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.userId = user.id;
  next();
}
