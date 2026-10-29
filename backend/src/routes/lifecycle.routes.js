import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, httpError, sendData } from '../utils/http.js';
import { parseId } from '../utils/db.js';
import { deriveLifecycle } from '../utils/lifecycle.js';

// Read-only trace of one evaluation summary through the whole flowchart:
// evaluations -> Form E -> report copies -> forwarding -> archive levels, plus the improvement branch.
const router = Router();
router.use(requireAuth);

const VIEWERS = ['admin', 'committee', 'department_head', 'dean', 'management', 'archives'];

// Same scope rules as the reports: a department head sees their own department, a dean their own
// faculty. Out-of-scope records are reported as "not found" so their existence is not revealed.
async function assertScope(user, instructorId) {
  if (user.role === 'department_head') {
    const [rows] = await pool.execute(
      `SELECT 1 AS ok FROM employees viewer
         JOIN employees target ON target.department_id = viewer.department_id
        WHERE viewer.user_id = ? AND viewer.department_id IS NOT NULL AND target.user_id = ? LIMIT 1`,
      [Number(user.id), Number(instructorId)],
    );
    if (!rows.length) throw httpError(404, 'Evaluation summary not found.', 'NOT_FOUND');
  } else if (user.role === 'dean') {
    const [rows] = await pool.execute(
      `SELECT 1 AS ok FROM employees viewer
         JOIN departments vd ON vd.id = viewer.department_id
         JOIN employees target ON target.user_id = ?
         JOIN departments td ON td.id = target.department_id
        WHERE viewer.user_id = ? AND viewer.department_id IS NOT NULL AND vd.faculty_id = td.faculty_id LIMIT 1`,
      [Number(instructorId), Number(user.id)],
    );
    if (!rows.length) throw httpError(404, 'Evaluation summary not found.', 'NOT_FOUND');
  }
}

// GET /api/lifecycle/summaries/:id
router.get('/summaries/:id', allowRoles(...VIEWERS), asyncHandler(async (req, res) => {
  const summaryId = parseId(req.params.id, 'summary ID');

  const [[summary]] = await pool.execute(
    `SELECT s.id, s.cycle_id, s.instructor_id, s.status, s.finalized_at, u.name AS instructor_name, cy.title AS cycle_title
       FROM evaluation_summaries s
       JOIN users u ON u.id = s.instructor_id
       JOIN evaluation_cycles cy ON cy.id = s.cycle_id
      WHERE s.id = ?`,
    [summaryId],
  );
  if (!summary) throw httpError(404, 'Evaluation summary not found.', 'NOT_FOUND');
  await assertScope(req.user, summary.instructor_id);

  const [evaluators] = await pool.execute(
    `SELECT f.evaluator_type AS type, COUNT(*) AS assigned,
            COALESCE(SUM(e.status IN ('submitted', 'approved')), 0) AS submitted,
            COALESCE(SUM(e.status = 'approved'), 0) AS approved
       FROM evaluation_assignments a
       JOIN evaluation_forms f ON f.id = a.form_id
       LEFT JOIN evaluations e ON e.assignment_id = a.id
      WHERE a.cycle_id = ? AND a.instructor_id = ?
      GROUP BY f.evaluator_type`,
    [summary.cycle_id, summary.instructor_id],
  );
  const [copies] = await pool.execute(
    "SELECT recipient_type FROM evaluation_report_distributions WHERE summary_id = ? AND status = 'recorded'", [summaryId],
  );
  const [[routing]] = await pool.execute(
    'SELECT forwarded_at, archived_at, archive_reference FROM evaluation_report_routing WHERE summary_id = ?', [summaryId],
  );
  const [levels] = await pool.execute(
    'SELECT archive_level FROM evaluation_archive_records WHERE summary_id = ?', [summaryId],
  );
  const [referrals] = await pool.execute(
    `SELECT r.id, r.acknowledged_at IS NOT NULL AS acknowledged,
            (SELECT COUNT(*) FROM support_activities a WHERE a.referral_id = r.id) AS activityCount,
            (SELECT COUNT(*) FROM support_activities a WHERE a.referral_id = r.id AND a.completed_at IS NOT NULL) AS completedCount
       FROM improvement_referrals r WHERE r.summary_id = ?`,
    [summaryId],
  );

  const result = deriveLifecycle({
    summary,
    evaluators: evaluators.map((r) => ({ ...r, assigned: Number(r.assigned), submitted: Number(r.submitted), approved: Number(r.approved) })),
    copies: copies.map((r) => r.recipient_type),
    routing: routing ? { forwardedAt: routing.forwarded_at, archivedAt: routing.archived_at } : null,
    levels: levels.map((r) => r.archive_level),
    referrals: referrals.map((r) => ({ acknowledged: Boolean(Number(r.acknowledged)), activityCount: Number(r.activityCount), completedCount: Number(r.completedCount) })),
  });

  sendData(res, {
    ...result,
    instructorName: summary.instructor_name,
    cycleTitle: summary.cycle_title,
    finalizedAt: summary.finalized_at,
  });
}));

export default router;