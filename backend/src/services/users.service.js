import bcrypt from 'bcrypt';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { writeAudit } from '../utils/audit.js';

const ROLES = [
  'admin',
  'student',
  'teacher',
  'department_head',
  'dean',
  'committee',
  'management',
  'academic_vp',
  'archives',
  'concerned_office',
];

const STATUSES = ['active', 'inactive', 'suspended'];

const publicFields = `
  id, name, email, role, status, phone, gender,
  date_of_birth, address, id_number, profile_photo,
  created_at, updated_at
`;

const userSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  role: z.enum(ROLES),
  phone: z.string().trim().max(20).nullable().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  date_of_birth: z.string().date().nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  id_number: z.string().trim().max(40).nullable().optional(),
  profile_photo: z.string().trim().max(255).nullable().optional(),
});

function fail(message, statusCode = 400, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    phone: user.phone,
    gender: user.gender,
    dateOfBirth: user.date_of_birth,
    address: user.address,
    idNumber: user.id_number,
    profilePhoto: user.profile_photo,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function parseUser(input) {
  const result = userSchema.safeParse(input);

  if (!result.success) {
    fail(result.error.issues[0]?.message || 'Invalid user data.');
  }

  return {
    ...result.data,
    email: result.data.email.toLowerCase(),
  };
}

function nullableFields(data) {
  for (const field of [
    'phone',
    'gender',
    'date_of_birth',
    'address',
    'id_number',
    'profile_photo',
  ]) {
    if (data[field] === '') data[field] = null;
  }

  return data;
}

function isDuplicateEmail(error) {
  return error.code === 'ER_DUP_ENTRY';
}

function validateId(id) {
  if (!/^[1-9]\d*$/.test(String(id))) {
    fail('Invalid user ID.', 400, 'INVALID_USER_ID');
  }
}

async function audit(connection, req, action, userId, details = {}) {
  await writeAudit(connection, {
    userId: req.user.id,
    action,
    entityType: 'user',
    entityId: userId,
    details,
    ipAddress: req.ip,
  });
}

export async function listUsers(query, req) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(query.limit, 10) || 10),
  );
  const offset = (page - 1) * limit;

  if (!Number.isSafeInteger(offset)) {
    fail('Invalid pagination parameters.');
  }

  const search = String(query.search || '').trim().slice(0, 255);
  const role = query.role || '';
  const status = query.status || '';

  if (role && !ROLES.includes(role)) fail('Invalid role filter.');
  if (status && !STATUSES.includes(status)) fail('Invalid status filter.');

  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(name LIKE ? OR email LIKE ? OR id_number LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  if (role) {
    conditions.push('role = ?');
    params.push(role);
  }

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM users ${where}`,
    params,
  );

  const [rows] = await pool.execute(
    `SELECT ${publicFields}
       FROM users
       ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    users: rows.map(publicUser),
    pagination: {
      page,
      limit,
      total: Number(countRows[0].total),
      totalPages: Math.ceil(Number(countRows[0].total) / limit),
    },
  };
}

export async function createUser(input, req) {
  const data = nullableFields(parseUser(input));

  if (
    typeof input.password !== 'string' ||
    input.password.length < 12 ||
    input.password.length > 128
  ) {
    fail('Initial password must be between 12 and 128 characters.');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO users
        (name, email, password, role, status, phone, gender,
         date_of_birth, address, id_number, profile_photo)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.email,
        passwordHash,
        data.role,
        data.phone ?? null,
        data.gender ?? null,
        data.date_of_birth ?? null,
        data.address ?? null,
        data.id_number ?? null,
        data.profile_photo ?? null,
      ],
    );

    await audit(connection, req, 'user.created', result.insertId, {
      role: data.role,
    });

    const [rows] = await connection.execute(
      `SELECT ${publicFields} FROM users WHERE id = ?`,
      [result.insertId],
    );

    await connection.commit();

    return publicUser(rows[0]);
  } catch (error) {
    await connection.rollback();

    if (isDuplicateEmail(error)) {
      fail('A user with this email or ID number already exists.', 409, 'DUPLICATE_USER');
    }

    throw error;
  } finally {
    connection.release();
  }
}

export async function updateUser(id, input, req) {
  validateId(id);

  const data = nullableFields(parseUser(input));
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      `SELECT id, role, status FROM users WHERE id = ? FOR UPDATE`,
      [id],
    );

    const existing = existingRows[0];
    if (!existing) fail('User not found.', 404, 'USER_NOT_FOUND');

    if (
      existing.role === 'admin' &&
      existing.status === 'active' &&
      data.role !== 'admin'
    ) {
      const [admins] = await connection.execute(
        `SELECT id FROM users
         WHERE role = 'admin' AND status = 'active'
         FOR UPDATE`,
      );

      if (admins.length <= 1) {
        fail('Cannot demote the last active administrator.', 409, 'LAST_ADMIN');
      }
    }

    await connection.execute(
      `UPDATE users
          SET name = ?, email = ?, role = ?, phone = ?, gender = ?,
              date_of_birth = ?, address = ?, id_number = ?, profile_photo = ?
        WHERE id = ?`,
      [
        data.name,
        data.email,
        data.role,
        data.phone ?? null,
        data.gender ?? null,
        data.date_of_birth ?? null,
        data.address ?? null,
        data.id_number ?? null,
        data.profile_photo ?? null,
        id,
      ],
    );

    await audit(connection, req, 'user.updated', id, {
      previousRole: existing.role,
      newRole: data.role,
    });

    const [rows] = await connection.execute(
      `SELECT ${publicFields} FROM users WHERE id = ?`,
      [id],
    );

    await connection.commit();

    return publicUser(rows[0]);
  } catch (error) {
    await connection.rollback();

    if (isDuplicateEmail(error)) {
      fail('A user with this email or ID number already exists.', 409, 'DUPLICATE_USER');
    }

    throw error;
  } finally {
    connection.release();
  }
}

export async function changeUserStatus(id, status, req) {
  validateId(id);

  if (!STATUSES.includes(status)) fail('Invalid account status.');

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT id, role, status FROM users WHERE id = ? FOR UPDATE`,
      [id],
    );

    const user = rows[0];
    if (!user) fail('User not found.', 404, 'USER_NOT_FOUND');

    if (Number(user.id) === Number(req.user.id) && status !== 'active') {
      fail('You cannot deactivate or suspend your own account.', 409, 'SELF_DEACTIVATION');
    }

    if (
      user.role === 'admin' &&
      user.status === 'active' &&
      status !== 'active'
    ) {
      const [admins] = await connection.execute(
        `SELECT id FROM users
         WHERE role = 'admin' AND status = 'active'
         FOR UPDATE`,
      );

      if (admins.length <= 1) {
        fail('Cannot deactivate the last active administrator.', 409, 'LAST_ADMIN');
      }
    }

    await connection.execute(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, id],
    );

    await audit(connection, req, 'user.status_changed', id, {
      previousStatus: user.status,
      newStatus: status,
    });

    await connection.commit();

    return { id: user.id, status };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}