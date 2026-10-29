import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, sendData } from '../utils/http.js';

// Read-only view of the audit trail. Administrators only.
const router = Router();
router.use(requireAuth, allowRoles('admin'));

function parseDetails(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return String(value);
  }
}

// GET /api/audit?page=1&pageSize=25&action=...&search=...
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));

  const clauses = [];
  const values = [];

  const action = String(req.query.action || '').trim();
  if (action) {
    clauses.push('al.action = ?');
    values.push(action);
  }

  const search = String(req.query.search || '').trim();
  if (search) {
    clauses.push('(u.name LIKE ? OR u.email LIKE ?)');
    values.push(`%${search}%`, `%${search}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}`,
    values,
  );

  const [rows] = await pool.query(
    `SELECT al.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
      ORDER BY al.id DESC
      LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );

  const [actionRows] = await pool.query('SELECT DISTINCT action FROM audit_logs ORDER BY action');

  sendData(res, {
    items: rows.map((row) => ({
      id: Number(row.id),
      createdAt: row.created_at ?? null,
      action: row.action,
      entityType: row.entity_type ?? null,
      entityId: row.entity_id === null || row.entity_id === undefined ? null : Number(row.entity_id),
      details: parseDetails(row.details),
      ipAddress: row.ip_address ?? null,
      user: row.user_id
        ? { id: Number(row.user_id), name: row.user_name, email: row.user_email, role: row.user_role }
        : null,
    })),
    total: Number(total),
    page,
    pageSize,
    actions: actionRows.map((row) => row.action),
  });
}));

export default router;