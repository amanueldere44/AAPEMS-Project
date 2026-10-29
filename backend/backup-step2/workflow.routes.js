import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, httpError, sendData } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';
import { recomputeInstructorSummary } from '../services/summaryService.js';

const router = Router();
router.use(requireAuth);

const stageRoles = ['committee', 'department_head', 'dean', 'management'];
const actionSchema = z.object({ action: z.enum(['approved', 'returned', 'rejected']), comment: z.string().max(10000).optional().nullable() });

router.get('/queue', allowRoles('admin', ...stageRoles), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT e.id AS evaluation_id, e.status AS evaluation_status, e.submitted_at,
            a.id AS assignment_id, a.cycle_id, cy.title AS cycle_title, f.code AS form_code,
            f.title AS form_title, f.weight, instructor.name AS instructor_name,
            evaluator.name AS evaluator_name, e.overall_average, e.weighted_score,
            (SELECT COUNT(*) FROM evaluation_reviews r WHERE r.evaluation_id = e.id AND r.action = 'approved') AS approvals
       FROM evaluations e
       JOIN evaluation_assignments a ON a.id = e.assignment_id
       JOIN evaluation_cycles cy ON cy.id = a.cycle_id
       JOIN evaluation_forms f ON f.id = a.form_id
       JOIN users instructor ON instructor.id = a.instructor_id
       JOIN users evaluator ON evaluator.id = a.evaluator_id
      WHERE e.status = 'submitted'
      ORDER BY e.submitted_at ASC`
  );
  const filtered = req.user.role === 'admin' ? rows : rows.filter(row => stageRoles[Number(row.approvals)] === req.user.role);
  sendData(res, filtered);
}));

router.post('/:evaluationId/review', allowRoles('admin', ...stageRoles), asyncHandler(async (req, res) => {
  const evaluationId = Number(req.params.evaluationId);
  if (!Number.isSafeInteger(evaluationId) || evaluationId < 1) throw httpError(400, 'Invalid evaluation ID.', 'VALIDATION_ERROR');
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'Invalid review action.', 'VALIDATION_ERROR');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT e.id, e.status, a.id AS assignment_id, a.cycle_id, a.instructor_id
         FROM evaluations e JOIN evaluation_assignments a ON a.id = e.assignment_id
        WHERE e.id = ? FOR UPDATE`,
      [evaluationId]
    );
    const evaluation = rows[0];
    if (!evaluation) throw httpError(404, 'Evaluation not found.', 'NOT_FOUND');
    if (evaluation.status !== 'submitted') throw httpError(409, 'Only submitted evaluations can be reviewed.', 'NOT_REVIEWABLE');

    const [approvalRows] = await connection.execute(
      "SELECT COUNT(*) AS count FROM evaluation_reviews WHERE evaluation_id = ? AND action = 'approved'",
      [evaluationId]
    );
    const approvals = Number(approvalRows[0].count);
    const requiredRole = stageRoles[approvals];
    if (req.user.role !== 'admin' && req.user.role !== requiredRole) {
      throw httpError(403, `This review stage requires the ${requiredRole ?? 'next authorized'} role.`, 'WRONG_REVIEW_STAGE');
    }
    if (approvals >= stageRoles.length) throw httpError(409, 'All approval stages are already complete.', 'WORKFLOW_COMPLETE');

    await connection.execute(
      'INSERT INTO evaluation_reviews (evaluation_id, reviewer_id, action, comment) VALUES (?, ?, ?, ?)',
      [evaluationId, Number(req.user.id), parsed.data.action, parsed.data.comment ?? null]
    );

    let nextStatus = 'submitted';
    if (parsed.data.action === 'returned') nextStatus = 'returned';
    if (parsed.data.action === 'rejected') nextStatus = 'rejected';
    if (parsed.data.action === 'approved' && approvals === stageRoles.length - 1) nextStatus = 'approved';
    await connection.execute('UPDATE evaluations SET status = ? WHERE id = ?', [nextStatus, evaluationId]);

    // Every review action can change the result (a returned or rejected evaluation stops
    // counting; the last approval releases it), so recalculate Form E inside this transaction.
    const summary = await recomputeInstructorSummary(
      connection, evaluation.cycle_id, evaluation.instructor_id, { finalizedBy: Number(req.user.id) }
    );
    await writeAudit(connection, { userId: Number(req.user.id), action: `evaluation_${parsed.data.action}`, entityType: 'evaluation', entityId: evaluationId, details: { stage: requiredRole ?? 'admin', comment: parsed.data.comment ?? null }, ipAddress: req.ip });
    await connection.commit();
    sendData(res, { evaluationId, status: nextStatus, approvalsCompleted: parsed.data.action === 'approved' ? approvals + 1 : approvals, summaryStatus: summary.status });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

export default router;