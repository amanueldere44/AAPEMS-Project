import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { authenticate } from '../middlewares/auth.js';
import {
  changePassword,
  getCurrentUser,
  loginUser,
  updateProfile,
} from '../services/auth.service.js';

const router = Router();

// Limits guessing of the current password from a stolen session.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Please try again later.',
    code: 'RATE_LIMITED',
  },
});

/**
 * POST /api/auth/login
 * Public: validates credentials and returns a JWT.
 */
router.post('/login', async (req, res, next) => {
  try {
    const result = await loginUser(req.body);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/auth/me
 * Protected: returns the authenticated user's public profile.
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await getCurrentUser(req.user.id);

    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /api/auth/profile
 * Protected: the user updates their own phone number and address.
 */
router.patch('/profile', authenticate, async (req, res, next) => {
  try {
    const user = await updateProfile(req.user.id, req.body, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Profile updated.',
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/auth/change-password
 * Protected: the user changes their own password.
 */
router.post('/change-password', authenticate, passwordLimiter, async (req, res, next) => {
  try {
    const result = await changePassword(req.user.id, req.body, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Password changed.',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;