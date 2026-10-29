
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { pool } from '../config/database.js';

// Verify the token and reload the user from the database.
export async function authenticate(req, res, next) {
  const authorization = req.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication is required.',
      code: 'AUTHENTICATION_REQUIRED',
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication is required.',
      code: 'AUTHENTICATION_REQUIRED',
    });
  }

  let payload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'asems-api',
      audience: 'asems-web',
    });
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Your session is invalid or has expired. Please sign in again.',
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
  }

  const userId = Number(payload.sub);

  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token.',
      code: 'INVALID_TOKEN_SUBJECT',
    });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, name, email, role, status
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [userId],
    );

    const user = rows[0];

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Your account is unavailable.',
        code: 'ACCOUNT_UNAVAILABLE',
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

// Backward-compatible alias used by existing routes.
export const requireAuth = authenticate;

// Re-export role authorization for routes importing from auth.js.
export { authorize, allowRoles } from './authorize.js';
