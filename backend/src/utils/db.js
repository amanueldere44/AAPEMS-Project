import { pool } from '../config/database.js';
import { httpError } from './http.js';

// Shared helpers for new services and routes. The older route files still carry
// their own private copies; they can be switched to these later.

export function parseId(value, label) {
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw httpError(400, `Invalid ${label}.`, 'VALIDATION_ERROR');
  }
  return Number(value);
}

export function parseBody(schema, body, message) {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw httpError(
      400,
      `${message} ${issue.path.join('.') || 'body'}: ${issue.message}`.trim(),
      'VALIDATION_ERROR',
    );
  }
  return parsed.data;
}

export async function inTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}