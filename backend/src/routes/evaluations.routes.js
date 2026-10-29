import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { requireAuth } from '../middlewares/auth.js';
import { asyncHandler, httpError, sendData } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';
import { scoreProblem } from '../utils/formContent.js';
import { SCORING_CONFIG, responseFromDbRow, roundTo, scoreEvaluation } from '../utils/evaluationSummary.js';
import { recomputeInstructorSummary } from '../services/summaryService.js';

const router = Router();
router.use(requireAuth);

// Evaluation forms are filled in and submitted only by the evaluator they were assigned to.
// Administrators manage tasks and workflow, but must not evaluate (separation of duties).
router.use((req, res, next) => {
  if (req.user?.role === 'admin') {
    return next(httpError(403, 'Administrators cannot fill in or submit evaluation forms.', 'ADMIN_CANNOT_EVALUATE'));
  }
  return next();
});

const evaluationSchema = z.object({
  scores: z.array(z.object({
    criterionId: z.number().int().positive(),
    score: z.union([z.number().int().min(0).max(5), z.literal('NA')]),
  })).min(1),
  commentStrengths: z.string().max(10000).optional().nullable(),
  commentImprovements: z.string().max(10000).optional().nullable(),
});
const commentsSchema = z.object({
  commentStrengths: z.string().max(10000).optional().nullable(),
  commentImprovements: z.string().max(10000).optional().nullable(),
});

async function getOwnedAssignment(connection, assignmentId, userId) {
  const [rows] = await connection.execute(
    `SELECT a.id, a.cycle_id, a.form_id, a.instructor_id, a.evaluator_id, a.status AS assignment_status,
            cy.status AS cycle_status, f.weight, f.evaluator_type,
            a.form_version_id, fv.scale_min, fv.scale_max, fv.allow_na
       FROM evaluation_assignments a
       JOIN evaluation_cycles cy ON cy.id = a.cycle_id
       JOIN evaluation_forms f ON f.id = a.form_id
       JOIN form_versions fv ON fv.id = a.form_version_id
      WHERE a.id = ? AND a.evaluator_id = ?
      LIMIT 1`,
    [assignmentId, userId]
  );
  return rows[0];
}

router.put('/:assignmentId/draft', asyncHandler(async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  if (!Number.isSafeInteger(assignmentId) || assignmentId < 1) throw httpError(400, 'Invalid assignment ID.', 'VALIDATION_ERROR');
  const parsed = evaluationSchema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'Invalid evaluation payload.', 'VALIDATION_ERROR');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const assignment = await getOwnedAssignment(connection, assignmentId, Number(req.user.id));
    if (!assignment) throw httpError(404, 'Assignment not found.', 'NOT_FOUND');
    if (assignment.cycle_status !== 'active') throw httpError(409, 'This evaluation cycle is not active.', 'CYCLE_NOT_ACTIVE');

    const [existingRows] = await connection.execute('SELECT id, status FROM evaluations WHERE assignment_id = ? FOR UPDATE', [assignmentId]);
    if (existingRows[0]?.status === 'approved' || existingRows[0]?.status === 'submitted') {
      throw httpError(409, 'A submitted or approved evaluation cannot be edited.', 'EVALUATION_LOCKED');
    }

    const [allowedRows] = await connection.execute(
      `SELECT c.id FROM form_criteria c
       JOIN form_sections s ON s.id = c.section_id
       WHERE s.form_version_id = ? AND c.is_active = 1`,
      [assignment.form_version_id]
    );
    const allowedIds = new Set(allowedRows.map(row => Number(row.id)));
    const uniqueScores = new Map();
    for (const item of parsed.data.scores) {
      if (!allowedIds.has(item.criterionId)) throw httpError(400, `Criterion ${item.criterionId} does not belong to this evaluation form.`, 'INVALID_CRITERION');
      if (uniqueScores.has(item.criterionId)) throw httpError(400, 'A criterion may only be scored once.', 'DUPLICATE_CRITERION');
      const scale = scoreProblem(item.score, assignment);
      if (scale) throw httpError(400, scale, 'INVALID_SCORE');
      uniqueScores.set(item.criterionId, item.score);
    }

    let evaluationId = existingRows[0]?.id;
    if (evaluationId) {
      await connection.execute(
        `UPDATE evaluations SET status = 'draft', comment_strengths = ?, comment_improvements = ?,
         overall_average = NULL, weighted_score = NULL, submitted_at = NULL WHERE id = ?`,
        [parsed.data.commentStrengths ?? null, parsed.data.commentImprovements ?? null, evaluationId]
      );
      await connection.execute('DELETE FROM evaluation_scores WHERE evaluation_id = ?', [evaluationId]);
    } else {
      const [insert] = await connection.execute(
        `INSERT INTO evaluations (assignment_id, status, comment_strengths, comment_improvements)
         VALUES (?, 'draft', ?, ?)`,
        [assignmentId, parsed.data.commentStrengths ?? null, parsed.data.commentImprovements ?? null]
      );
      evaluationId = insert.insertId;
    }

    for (const [criterionId, score] of uniqueScores) {
      await connection.execute(
        'INSERT INTO evaluation_scores (evaluation_id, criterion_id, score, is_na) VALUES (?, ?, ?, ?)',
        [evaluationId, criterionId, score === 'NA' ? null : score, score === 'NA' ? 1 : 0]
      );
    }
    await connection.execute("UPDATE evaluation_assignments SET status = 'draft' WHERE id = ?", [assignmentId]);
    await writeAudit(connection, { userId: Number(req.user.id), action: 'evaluation_saved_draft', entityType: 'evaluation', entityId: evaluationId, details: { assignmentId, scoreCount: uniqueScores.size }, ipAddress: req.ip });
    await connection.commit();
    sendData(res, { evaluationId, assignmentId, status: 'draft', savedScores: uniqueScores.size }, 200);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.post('/:assignmentId/submit', asyncHandler(async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  if (!Number.isSafeInteger(assignmentId) || assignmentId < 1) throw httpError(400, 'Invalid assignment ID.', 'VALIDATION_ERROR');
  const parsed = commentsSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw httpError(400, 'Invalid comments.', 'VALIDATION_ERROR');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const assignment = await getOwnedAssignment(connection, assignmentId, Number(req.user.id));
    if (!assignment) throw httpError(404, 'Assignment not found.', 'NOT_FOUND');
    if (assignment.cycle_status !== 'active') throw httpError(409, 'This evaluation cycle is not active.', 'CYCLE_NOT_ACTIVE');

    const [evaluationRows] = await connection.execute('SELECT id, status FROM evaluations WHERE assignment_id = ? FOR UPDATE', [assignmentId]);
    const evaluation = evaluationRows[0];
    if (!evaluation || !['draft', 'returned', 'rejected'].includes(evaluation.status)) throw httpError(409, 'Save a draft before submitting, or this evaluation has already been submitted.', 'NOT_SUBMITTABLE');

    const [criteriaRows] = await connection.execute(
      `SELECT c.id, s.section_key AS sectionKey, s.title AS sectionTitle
         FROM form_criteria c JOIN form_sections s ON s.id = c.section_id
        WHERE s.form_version_id = ? AND c.is_active = 1
        ORDER BY s.sort_order, s.id, c.sort_order, c.id`,
      [assignment.form_version_id]
    );
    const [scoreRows] = await connection.execute(
      'SELECT criterion_id, score, is_na FROM evaluation_scores WHERE evaluation_id = ?',
      [evaluation.id]
    );

    // One scoring rule for the whole system: see utils/evaluationSummary.js.
    const result = scoreEvaluation(scoreRows.map(responseFromDbRow), criteriaRows);
    if (!result.ok) {
      const missing = result.issues.filter(issue => issue.code === 'MISSING_RESPONSE').length;
      if (missing) throw httpError(400, `Complete every criterion before submitting. ${missing} response(s) are missing.`, 'INCOMPLETE_EVALUATION');
      if (result.issues[0]?.code === 'NO_SCORED_CRITERIA') throw httpError(400, 'At least one numeric score is required.', 'NO_NUMERIC_SCORES');
      throw httpError(400, result.issues[0]?.message ?? 'The evaluation could not be scored.', 'INVALID_EVALUATION');
    }
    const average = roundTo(result.overall.average);
    const weighted = roundTo(Number(assignment.weight) * result.overall.sum / (SCORING_CONFIG.scaleMax * result.overall.counted));

    await connection.execute(
      `UPDATE evaluations SET status = 'submitted', comment_strengths = ?, comment_improvements = ?,
       overall_average = ?, weighted_score = ?, submitted_at = NOW() WHERE id = ?`,
      [parsed.data.commentStrengths ?? null, parsed.data.commentImprovements ?? null, average, weighted, evaluation.id]
    );
    await connection.execute("UPDATE evaluation_assignments SET status = 'submitted' WHERE id = ?", [assignmentId]);
    await recomputeInstructorSummary(connection, assignment.cycle_id, assignment.instructor_id);
    await writeAudit(connection, { userId: Number(req.user.id), action: 'evaluation_submitted', entityType: 'evaluation', entityId: evaluation.id, details: { assignmentId, average, weightedScore: weighted }, ipAddress: req.ip });
    await connection.commit();
    sendData(res, { evaluationId: evaluation.id, assignmentId, status: 'submitted', overallAverage: average, weightedScore: weighted, note: 'Component scores are recorded; the final instructor score is calculated only when all four component evaluations are submitted.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

export default router;