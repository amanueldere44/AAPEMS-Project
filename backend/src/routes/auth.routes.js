import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { authenticate } from '../middlewares/auth.js';
import {
  changePassword,
  getCurrentUser,
  loginUser,
  updateProfile,
  updateProfilePhoto,
} from '../services/auth.service.js';

const router = Router();
const uploadDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../uploads/profile-photos',
);
fs.mkdirSync(uploadDirectory, { recursive: true });

const imageExtensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

function parseProfilePhoto(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!contentType.toLowerCase().startsWith('multipart/form-data') || !boundary) {
    const error = new Error('Choose a profile picture to upload.');
    error.statusCode = 400;
    error.code = 'PROFILE_IMAGE_REQUIRED';
    return next(error);
  }

  const chunks = [];
  let total = 0;
  let tooLarge = false;
  req.on('data', (chunk) => {
    total += chunk.length;
    if (total > 3 * 1024 * 1024 + 16 * 1024) {
      tooLarge = true;
      return;
    }
    if (!tooLarge) chunks.push(chunk);
  });
  req.on('error', next);
  req.on('end', () => {
    try {
      if (tooLarge) {
        const error = new Error('The profile picture must be 3 MB or smaller.');
        error.statusCode = 413;
        error.code = 'PROFILE_IMAGE_TOO_LARGE';
        return next(error);
      }
      const body = Buffer.concat(chunks);
      const delimiter = Buffer.from(`--${boundary[1] || boundary[2]}`);
      const parts = body.toString('latin1').split(delimiter.toString('latin1'));
      let imageBuffer = null;
      let mimeType = '';

      for (const part of parts) {
        const headerEnd = part.indexOf('\\r\\n\\r\\n');
        if (headerEnd < 0) continue;
        const headers = part.slice(0, headerEnd);
        if (!/name="photo"/i.test(headers)) continue;
        const typeMatch = headers.match(/content-type:\\s*([^\\r\\n]+)/i);
        mimeType = (typeMatch?.[1] || '').trim().toLowerCase();
        let content = part.slice(headerEnd + 4);
        if (content.endsWith('\\r\\n')) content = content.slice(0, -2);
        if (content.endsWith('--')) content = content.slice(0, -2);
        imageBuffer = Buffer.from(content, 'latin1');
        break;
      }

      if (!imageBuffer || !imageBuffer.length) {
        const error = new Error('Choose a profile picture to upload.');
        error.statusCode = 400;
        error.code = 'PROFILE_IMAGE_REQUIRED';
        return next(error);
      }
      if (!imageExtensions[mimeType]) {
        const error = new Error('Please upload a JPG, PNG, GIF or WebP image.');
        error.statusCode = 400;
        error.code = 'INVALID_PROFILE_IMAGE';
        return next(error);
      }
      if (imageBuffer.length > 3 * 1024 * 1024) {
        const error = new Error('The profile picture must be 3 MB or smaller.');
        error.statusCode = 413;
        error.code = 'PROFILE_IMAGE_TOO_LARGE';
        return next(error);
      }

      const isValidImage =
        (mimeType === 'image/jpeg' && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8) ||
        (mimeType === 'image/png' && imageBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (mimeType === 'image/gif' && ['GIF87a', 'GIF89a'].includes(imageBuffer.subarray(0, 6).toString())) ||
        (mimeType === 'image/webp' && imageBuffer.subarray(0, 4).toString() === 'RIFF' && imageBuffer.subarray(8, 12).toString() === 'WEBP');

      if (!isValidImage) {
        const error = new Error('The selected file is not a valid supported image.');
        error.statusCode = 400;
        error.code = 'INVALID_PROFILE_IMAGE';
        return next(error);
      }

      req.profileImage = { buffer: imageBuffer, extension: imageExtensions[mimeType] };
      return next();
    } catch (error) {
      return next(error);
    }
  });
}

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
 * POST /api/auth/profile-photo
 * Protected: uploads/replaces the signed-in user's profile picture.
 */
router.post('/profile-photo', authenticate, parseProfilePhoto, async (req, res, next) => {
  let savedPath;
  try {
    const filename = `profile-${randomUUID()}${req.profileImage.extension}`;
    savedPath = path.join(uploadDirectory, filename);
    await fs.promises.writeFile(savedPath, req.profileImage.buffer, { flag: 'wx' });
    const user = await updateProfilePhoto(
      req.user.id,
      `/uploads/profile-photos/${filename}`,
      req.ip,
    );
    return res.status(200).json({
      success: true,
      message: 'Profile picture updated.',
      data: { user },
    });
  } catch (error) {
    if (savedPath) fs.promises.unlink(savedPath).catch(() => {});
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