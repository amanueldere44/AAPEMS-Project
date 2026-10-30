
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { env } from '../config/env.js';
import { pool } from '../config/database.js';
import { writeAudit } from '../utils/audit.js';

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
  selectedRole: z.enum(['admin', 'student', 'teacher', 'department_head', 'dean', 'committee', 'management', 'academic_vp', 'archives', 'concerned_office']).optional(),
});

const publicFields = `
  id, name, email, role, status, phone, gender,
  date_of_birth, address, id_number, profile_photo,
  created_at, updated_at
`;

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    phone: user.phone ?? null,
    gender: user.gender ?? null,
    dateOfBirth: user.date_of_birth ?? null,
    address: user.address ?? null,
    idNumber: user.id_number ?? null,
    profilePhoto: user.profile_photo ?? null,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function fail(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

export async function loginUser(input) {
  const parsed = loginSchema.safeParse(input ?? {});

  if (!parsed.success) {
    fail('Please provide a valid email and password.', 400, 'VALIDATION_ERROR');
  }

  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;

  const [rows] = await pool.execute(
    `SELECT id, name, email, password, role, status, profile_photo
       FROM users
      WHERE email = ?
      LIMIT 1`,
    [email],
  );

  const user = rows[0];

  // Use the same response for unknown emails and incorrect passwords.
  if (!user) {
    fail('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    fail('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  if (user.status !== 'active') {
    fail('Your account is unavailable.', 403, 'ACCOUNT_UNAVAILABLE');
  }

  // A role selected on the public access screen must match the account's assigned role.
  if (parsed.data.selectedRole && user.role !== parsed.data.selectedRole) {
    fail('This account is not assigned to the selected access category. Choose the correct category or use your authorized account.', 403, 'ROLE_MISMATCH');
  }

  const token = jwt.sign(
    {},
    env.JWT_SECRET,
    {
      subject: String(user.id),
      issuer: 'asems-api',
      audience: 'asems-web',
      expiresIn: env.JWT_EXPIRES_IN,
    },
  );

  await writeAudit(pool, {
    userId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    details: {},
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      profilePhoto: user.profile_photo ?? null,
    },
  };
}

export async function getCurrentUser(userId) {
  if (!/^[1-9]\d*$/.test(String(userId))) {
    fail('Invalid user ID.', 400, 'INVALID_USER_ID');
  }

  const [rows] = await pool.execute(
    `SELECT ${publicFields}
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [userId],
  );

  if (!rows[0] || rows[0].status !== 'active') {
    fail('User not found or account unavailable.', 404, 'USER_NOT_FOUND');
  }

  return publicUser(rows[0]);
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export async function changePassword(userId, input, ipAddress = null) {
  const parsed = changePasswordSchema.safeParse(input ?? {});

  if (!parsed.success) {
    fail('The new password must be between 12 and 128 characters.', 400, 'VALIDATION_ERROR');
  }

  const { currentPassword, newPassword } = parsed.data;

  if (currentPassword === newPassword) {
    fail('The new password must be different from the current password.', 400, 'VALIDATION_ERROR');
  }

  const [rows] = await pool.execute(
    'SELECT id, password, status FROM users WHERE id = ? LIMIT 1',
    [Number(userId)],
  );
  const user = rows[0];

  if (!user || user.status !== 'active') {
    fail('User not found or account unavailable.', 404, 'USER_NOT_FOUND');
  }

  // 400 (not 401) so the browser does not discard the session.
  const matches = await bcrypt.compare(currentPassword, user.password);

  if (!matches) {
    fail('The current password is incorrect.', 400, 'INVALID_CURRENT_PASSWORD');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.execute('UPDATE users SET password = ? WHERE id = ?', [passwordHash, user.id]);

  await writeAudit(pool, {
    userId: user.id,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: user.id,
    details: {},
    ipAddress,
  });

  return { changed: true };
}

const profileSchema = z.object({
  phone: z.string().trim().max(30).nullable(),
  address: z.string().trim().max(255).nullable(),
});

export async function updateProfile(userId, input, ipAddress = null) {
  const parsed = profileSchema.safeParse(input ?? {});

  if (!parsed.success) {
    fail('Please enter a valid phone number (up to 30 characters) and address.', 400, 'VALIDATION_ERROR');
  }

  const phone = parsed.data.phone || null;
  const address = parsed.data.address || null;

  await pool.execute(
    'UPDATE users SET phone = ?, address = ? WHERE id = ?',
    [phone, address, Number(userId)],
  );

  await writeAudit(pool, {
    userId: Number(userId),
    action: 'auth.profile_updated',
    entityType: 'user',
    entityId: Number(userId),
    details: { fields: ['phone', 'address'] },
    ipAddress,
  });

  return getCurrentUser(userId);
}
export async function updateProfilePhoto(userId, profilePhoto, ipAddress = null) {
  await pool.execute(
    'UPDATE users SET profile_photo = ? WHERE id = ?',
    [profilePhoto, Number(userId)],
  );

  await writeAudit(pool, {
    userId: Number(userId),
    action: 'auth.profile_photo_updated',
    entityType: 'user',
    entityId: Number(userId),
    details: {},
    ipAddress,
  });

  return getCurrentUser(userId);
}
