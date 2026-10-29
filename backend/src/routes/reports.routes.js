import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, httpError, sendData } from '../utils/http.js';

import { getFormESummary } from '../services/formEReportService.js';

const router = Router();
router.use(requireAuth);

// The system administrator is not part of the evaluation reporting chain (department head ->
// college -> Academic Affairs Vice President -> archives), so it does not read instructor summaries
// or Form E. Administrators still reopen rejected forms through the workflow routes.
const REPORT_ROLES = ['committee', 'department_head', 'dean', 'management', 'academic_vp'];

const SUMMARY_STATUSES = ['incomplete', 'complete', 'reviewed', 'archived'];

function parsePositiveInteger(value, label, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) throw httpError(400, `Invalid ${label}.`, 'VALIDATION_ERROR');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw httpError(400, `Invalid ${label}.`, 'VALIDATION_ERROR');
  return parsed;
}
function buildScope(role, userId, clauses, values) {
  if (role === 'department_head') {
    clauses.push(`EXISTS (
      SELECT 1 FROM employees viewer
      JOIN employees target ON target.department_id = viewer.department_id
      WHERE viewer.user_id = ? AND target.user_id = s.instructor_id
        AND viewer.department_id IS NOT NULL
    )`);
    values.push(Number(userId));
  } else if (role === 'dean' || role === 'management') {
    // The college / school administration sees only the summaries of its own college.
    clauses.push(`EXISTS (
      SELECT 1
        FROM employees viewer
        JOIN departments viewer_department ON viewer_department.id = viewer.department_id
        JOIN employees target ON target.user_id = s.instructor_id
        JOIN departments target_department ON target_department.id = target.department_id
       WHERE viewer.user_id = ?
         AND viewer.department_id IS NOT NULL
         AND viewer_department.faculty_id = target_department.faculty_id
    )`);
    values.push(Number(userId));
  } else if (role === 'academic_vp') {
    // The VP office only sees summaries that the college administration forwarded to it.
    clauses.push(`EXISTS (
      SELECT 1 FROM evaluation_report_routing vp_routing
       WHERE vp_routing.summary_id = s.id
         AND (vp_routing.forwarded_to_vp_at IS NOT NULL OR vp_routing.forwarded_at IS NOT NULL)
    )`);
  }
}

async function assertSummaryScope(connection, user, instructorId, summaryId = null) {
  if (user.role === 'department_head') {
    const [rows] = await connection.execute(
      `SELECT EXISTS (
         SELECT 1 FROM employees viewer
         JOIN employees target ON target.department_id = viewer.department_id
        WHERE viewer.user_id = ? AND target.user_id = ? AND viewer.department_id IS NOT NULL
       ) AS allowed`,
      [Number(user.id), Number(instructorId)],
    );
    if (Number(rows[0]?.allowed) !== 1) throw httpError(404, 'Report not found.', 'NOT_FOUND');
  } else if (user.role === 'dean' || user.role === 'management') {
    const [rows] = await connection.execute(
      `SELECT EXISTS (
         SELECT 1
           FROM employees viewer
           JOIN departments vd ON vd.id = viewer.department_id
           JOIN employees target ON target.user_id = ?
           JOIN departments td ON td.id = target.department_id
          WHERE viewer.user_id = ? AND viewer.department_id IS NOT NULL
            AND vd.faculty_id = td.faculty_id
       ) AS allowed`,
      [Number(instructorId), Number(user.id)],
    );
    if (Number(rows[0]?.allowed) !== 1) throw httpError(404, 'Report not found.', 'NOT_FOUND');
  } else if (user.role === 'academic_vp') {
    const [rows] = await connection.execute(
      `SELECT EXISTS (
         SELECT 1 FROM evaluation_report_routing r
          WHERE r.summary_id = ? AND (r.forwarded_to_vp_at IS NOT NULL OR r.forwarded_at IS NOT NULL)
       ) AS allowed`,
      [Number(summaryId)],
    );
    if (Number(rows[0]?.allowed) !== 1) throw httpError(404, 'Report not found.', 'NOT_FOUND');
  }
}



// GET /api/reports/summaries?page=1&limit=25&cycleId=&academicYear=&departmentId=&facultyId=&instructorId=&status=&search=
router.get('/summaries', allowRoles(...REPORT_ROLES), asyncHandler(async (req, res) => {
  const page = parsePositiveInteger(req.query.page, 'page', 1);
  const limit = parsePositiveInteger(req.query.limit, 'limit', 25);
  if (limit > 100) throw httpError(400, 'limit cannot exceed 100.', 'VALIDATION_ERROR');

  const filters = {
    cycleId: parsePositiveInteger(req.query.cycleId, 'cycleId'),
    departmentId: parsePositiveInteger(req.query.departmentId, 'departmentId'),
    facultyId: parsePositiveInteger(req.query.facultyId, 'facultyId'),
    instructorId: parsePositiveInteger(req.query.instructorId, 'instructorId'),
    academicYear: req.query.academicYear ? String(req.query.academicYear).trim().slice(0, 20) : null,
    status: req.query.status ? String(req.query.status) : null,
    search: req.query.search ? String(req.query.search).trim().slice(0, 100) : null,
  };
  if (filters.status && !SUMMARY_STATUSES.includes(filters.status)) {
    throw httpError(400, 'Invalid summary status.', 'VALIDATION_ERROR');
  }

  const clauses = [];
  const values = [];
  if (filters.cycleId) { clauses.push('s.cycle_id = ?'); values.push(filters.cycleId); }
  if (filters.departmentId) {
    clauses.push(`EXISTS (SELECT 1 FROM employees filter_employee
      WHERE filter_employee.user_id = s.instructor_id AND filter_employee.department_id = ?)`);
    values.push(filters.departmentId);
  }
  if (filters.facultyId) {
    clauses.push(`EXISTS (SELECT 1 FROM employees filter_employee
      JOIN departments filter_department ON filter_department.id = filter_employee.department_id
      WHERE filter_employee.user_id = s.instructor_id AND filter_department.faculty_id = ?)`);
    values.push(filters.facultyId);
  }
  if (filters.instructorId) { clauses.push('s.instructor_id = ?'); values.push(filters.instructorId); }
  if (filters.academicYear) { clauses.push('cy.academic_year = ?'); values.push(filters.academicYear); }
  if (filters.status) { clauses.push('s.status = ?'); values.push(filters.status); }
  if (filters.search) {
    clauses.push('(u.name LIKE ? OR cy.title LIKE ? OR COALESCE(d.name, \'\') LIKE ? OR COALESCE(fac.name, \'\') LIKE ?)');
    const pattern = `%${filters.search}%`;
    values.push(pattern, pattern, pattern, pattern);
  }
  buildScope(req.user.role, req.user.id, clauses, values);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
       FROM evaluation_summaries s
       JOIN evaluation_cycles cy ON cy.id = s.cycle_id
       JOIN users u ON u.id = s.instructor_id
       LEFT JOIN employees emp ON emp.user_id = s.instructor_id
       LEFT JOIN departments d ON d.id = emp.department_id
       LEFT JOIN faculties fac ON fac.id = d.faculty_id
      ${where}`,
    values,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const [rows] = await pool.execute(
    `SELECT s.id, s.cycle_id, cy.title AS cycle_title, cy.academic_year,
            s.instructor_id, u.name AS instructor_name,
            d.id AS department_id, d.name AS department_name,
            fac.id AS faculty_id, fac.name AS faculty_name,
            s.student_average, s.student_weighted,
            s.department_head_average, s.department_head_weighted,
            s.peer_average, s.peer_weighted, s.self_average, s.self_weighted,
            s.total_score, s.status, s.finalized_by, s.finalized_at,
                        (rt.forwarded_to_vp_at IS NOT NULL OR rt.forwarded_at IS NOT NULL) AS forwarded_to_vp,
            COALESCE(stats.total_assignments, 0) AS total_assignments,
            COALESCE(stats.submitted_assignments, 0) AS submitted_assignments,
            COALESCE(stats.approved_assignments, 0) AS approved_assignments,
            CASE WHEN COALESCE(stats.total_assignments, 0) > 0
                       AND stats.total_assignments = stats.approved_assignments
                       AND stats.approved_components = 4
                 THEN 1 ELSE 0 END AS all_evaluations_approved
       FROM evaluation_summaries s
       JOIN evaluation_cycles cy ON cy.id = s.cycle_id
       JOIN users u ON u.id = s.instructor_id
       LEFT JOIN employees emp ON emp.user_id = s.instructor_id
       LEFT JOIN departments d ON d.id = emp.department_id
           LEFT JOIN faculties fac ON fac.id = d.faculty_id
       LEFT JOIN evaluation_report_routing rt ON rt.summary_id = s.id
       LEFT JOIN (
         SELECT a.cycle_id, a.instructor_id,



                COUNT(*) AS total_assignments,
                COALESCE(SUM(e.status IN ('submitted', 'approved')), 0) AS submitted_assignments,
                COALESCE(SUM(e.status = 'approved'), 0) AS approved_assignments,
                COUNT(DISTINCT CASE WHEN e.status = 'approved' THEN f.evaluator_type END) AS approved_components
           FROM evaluation_assignments a
           JOIN evaluation_forms f ON f.id = a.form_id
           LEFT JOIN evaluations e ON e.assignment_id = a.id
          GROUP BY a.cycle_id, a.instructor_id
       ) stats ON stats.cycle_id = s.cycle_id AND stats.instructor_id = s.instructor_id
       ${where}
      ORDER BY cy.start_date DESC, u.name ASC, s.id DESC
      LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit],
  );

  sendData(res, {
    items: rows.map((row) => ({
      ...row,
      id: Number(row.id),
      cycle_id: Number(row.cycle_id),
      instructor_id: Number(row.instructor_id),
      department_id: row.department_id === null ? null : Number(row.department_id),
      faculty_id: row.faculty_id === null ? null : Number(row.faculty_id),
      total_assignments: Number(row.total_assignments),
      submitted_assignments: Number(row.submitted_assignments),
      approved_assignments: Number(row.approved_assignments),
      all_evaluations_approved: Number(row.all_evaluations_approved) === 1,
            forwarded_to_vp: Number(row.forwarded_to_vp) === 1,
      student_average: row.student_average === null ? null : Number(row.student_average),
      student_weighted: Number(row.student_weighted),
      department_head_average: row.department_head_average === null ? null : Number(row.department_head_average),
      department_head_weighted: Number(row.department_head_weighted),
      peer_average: row.peer_average === null ? null : Number(row.peer_average),
      peer_weighted: Number(row.peer_weighted),
      self_average: row.self_average === null ? null : Number(row.self_average),
      self_weighted: Number(row.self_weighted),
      total_score: Number(row.total_score),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    filters,
  });
}));

// GET /api/reports/summaries/:id/form-e
router.get('/summaries/:id/form-e', allowRoles(...REPORT_ROLES), asyncHandler(async (req, res) => {
  const summaryId = parsePositiveInteger(req.params.id, 'summary ID');
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT instructor_id FROM evaluation_summaries WHERE id = ? LIMIT 1',
      [summaryId],
    );
    if (!rows[0]) throw httpError(404, 'Report not found.', 'NOT_FOUND');
        await assertSummaryScope(connection, req.user, rows[0].instructor_id, summaryId);    
    const report = await getFormESummary(connection, summaryId);
    sendData(res, report);
  } finally {
    connection.release();
  }
}));

export default router;