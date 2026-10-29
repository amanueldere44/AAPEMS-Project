import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, httpError, sendData } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';
import { recomputeInstructorSummary } from '../services/summaryService.js';

// Workflow rules (taken from the Reports & workflow page):
//   1. A committee member or department head reviews a submitted form (one review: approve, return or reject).
//      Nobody may review a form they submitted or a form that evaluates them.
//   2. An administrator may reopen a rejected form with a documented reason.
//   3. When every assigned form is approved, the committee or department head finalizes Form E
//      with the final comments. Only finalizing makes a summary "reviewed" (final).
//   4. The report office records the three report copies and forwards the report to the archive.
//      The archive office then records the three archive levels (department, college/school/institute,
//      university) through /api/archive; the report becomes "archived" after the third.
const router = Router();
router.use(requireAuth);

const REVIEW_ROLES = ['committee', 'department_head'];
const ALLOWED_OFFICE_ROLES = ['management', 'dean', 'admin'];
const REPORT_OFFICE_ROLE = process.env.ASEMS_REPORT_OFFICE_ROLE || 'management';
if (!ALLOWED_OFFICE_ROLES.includes(REPORT_OFFICE_ROLE)) {
  throw new Error('ASEMS_REPORT_OFFICE_ROLE must be one of: management, dean, admin.');
}
const RECIPIENTS = ['teacher', 'department', 'college'];

const reviewSchema = z.object({
  action: z.enum(['approved', 'returned', 'rejected']),
  comment: z.string().max(10000).optional().nullable(),
});
const reopenSchema = z.object({ comment: z.string().trim().min(1).max(10000) });
const finalizeSchema = z.object({
  strengths: z.string().trim().min(1).max(10000),
  improvements: z.string().trim().min(1).max(10000),
});
const noteSchema = z.object({ note: z.string().trim().max(1000).optional().nullable() });

function parseId(value, label) {
  if (!/^[1-9]\d*$/.test(String(value))) throw httpError(400, `Invalid ${label}.`, 'VALIDATION_ERROR');
  return Number(value);
}

// A department head only works with instructors of their own department. Out-of-scope
// records are reported as "not found" so their existence is not revealed.
async function assertInScope(connection, user, instructorId) {
  if (user.role !== 'department_head') return;
  const [rows] = await connection.execute(
    `SELECT 1 AS ok
       FROM employees viewer
       JOIN employees target ON target.department_id = viewer.department_id
      WHERE viewer.user_id = ? AND viewer.department_id IS NOT NULL AND target.user_id = ?
      LIMIT 1`,
    [Number(user.id), Number(instructorId)],
  );
  if (!rows.length) throw httpError(404, 'Record not found.', 'NOT_FOUND');
}

function parseBody(schema, body, message) {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw httpError(400, `${message} ${issue.path.join('.') || 'body'}: ${issue.message}`.trim(), 'VALIDATION_ERROR');
  }
  return parsed.data;
}

async function inTransaction(work) {
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

async function lockSummary(connection, summaryId) {
  const [rows] = await connection.execute(
    'SELECT id, cycle_id, instructor_id, status FROM evaluation_summaries WHERE id = ? FOR UPDATE',
    [summaryId],
  );
  if (!rows[0]) throw httpError(404, 'Evaluation summary not found.', 'NOT_FOUND');
  return rows[0];
}

/* ------------------------------------------------------------------ */
/* Review queue                                                        */
/* ------------------------------------------------------------------ */

// Reviewers see submitted forms they are allowed to review. Administrators also see
// rejected forms so they can reopen them. Student evaluators are never named.
router.get('/queue', allowRoles('admin', ...REVIEW_ROLES), asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const clauses = [isAdmin ? "e.status IN ('submitted', 'rejected')" : "e.status = 'submitted'"];
  const values = [];

  if (!isAdmin) {
    clauses.push('a.evaluator_id <> ?', 'a.instructor_id <> ?');
    values.push(Number(req.user.id), Number(req.user.id));
  }
  if (req.user.role === 'department_head') {
    clauses.push(`EXISTS (
      SELECT 1 FROM employees viewer
      JOIN employees target ON target.department_id = viewer.department_id
      WHERE viewer.user_id = ? AND viewer.department_id IS NOT NULL AND target.user_id = a.instructor_id
    )`);
    values.push(Number(req.user.id));
  }

  const [rows] = await pool.execute(
    `SELECT e.id AS evaluation_id, e.status AS evaluation_status, e.submitted_at,
            a.id AS assignment_id, a.cycle_id, cy.title AS cycle_title, f.code AS form_code,
            f.title AS form_title, f.weight, instructor.name AS instructor_name,
            CASE WHEN f.evaluator_type = 'student' THEN 'Student evaluator (anonymous)' ELSE evaluator.name END AS evaluator_name,
            e.overall_average, e.weighted_score
       FROM evaluations e
       JOIN evaluation_assignments a ON a.id = e.assignment_id
       JOIN evaluation_cycles cy ON cy.id = a.cycle_id
       JOIN evaluation_forms f ON f.id = a.form_id
       JOIN users instructor ON instructor.id = a.instructor_id
       JOIN users evaluator ON evaluator.id = a.evaluator_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY e.submitted_at ASC, e.id ASC`,
    values,
  );
  sendData(res, rows);
}));

/* ------------------------------------------------------------------ */
/* Review, reopen                                                      */
/* ------------------------------------------------------------------ */

router.post('/:evaluationId/review', allowRoles(...REVIEW_ROLES), asyncHandler(async (req, res) => {
  const evaluationId = parseId(req.params.evaluationId, 'evaluation ID');
  const input = parseBody(reviewSchema, req.body, 'Invalid review action.');
  const comment = input.comment?.trim() || null;
  if (input.action !== 'approved' && !comment) {
    throw httpError(400, 'A comment is required to return or reject an evaluation.', 'COMMENT_REQUIRED');
  }

  const result = await inTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT e.id, e.status, a.cycle_id, a.instructor_id, a.evaluator_id
         FROM evaluations e JOIN evaluation_assignments a ON a.id = e.assignment_id
        WHERE e.id = ? FOR UPDATE`,
      [evaluationId],
    );
    const evaluation = rows[0];
    if (!evaluation) throw httpError(404, 'Evaluation not found.', 'NOT_FOUND');
    await assertInScope(connection, req.user, evaluation.instructor_id);

    const reviewerId = Number(req.user.id);
    if (reviewerId === Number(evaluation.evaluator_id) || reviewerId === Number(evaluation.instructor_id)) {
      throw httpError(403, 'You cannot review an evaluation you submitted or one that evaluates you.', 'SELF_REVIEW');
    }
    if (evaluation.status !== 'submitted') {
      throw httpError(409, 'Only submitted evaluations can be reviewed.', 'NOT_REVIEWABLE');
    }

    await connection.execute(
      'INSERT INTO evaluation_reviews (evaluation_id, reviewer_id, action, comment) VALUES (?, ?, ?, ?)',
      [evaluationId, reviewerId, input.action, comment],
    );
    await connection.execute('UPDATE evaluations SET status = ? WHERE id = ?', [input.action, evaluationId]);

    // A returned or rejected evaluation stops counting; an approval can complete the set.
    const summary = await recomputeInstructorSummary(connection, evaluation.cycle_id, evaluation.instructor_id);
    await writeAudit(connection, {
      userId: reviewerId, action: `evaluation_${input.action}`, entityType: 'evaluation', entityId: evaluationId,
      details: { role: req.user.role, comment }, ipAddress: req.ip,
    });
    return { evaluationId, status: input.action, summaryStatus: summary.status };
  });
  sendData(res, result);
}));

router.post('/:evaluationId/reopen', allowRoles('admin'), asyncHandler(async (req, res) => {
  const evaluationId = parseId(req.params.evaluationId, 'evaluation ID');
  const { comment } = parseBody(reopenSchema, req.body, 'A reason is required.');

  const result = await inTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT e.id, e.status, a.cycle_id, a.instructor_id, cy.status AS cycle_status
         FROM evaluations e
         JOIN evaluation_assignments a ON a.id = e.assignment_id
         JOIN evaluation_cycles cy ON cy.id = a.cycle_id
        WHERE e.id = ? FOR UPDATE`,
      [evaluationId],
    );
    const evaluation = rows[0];
    if (!evaluation) throw httpError(404, 'Evaluation not found.', 'NOT_FOUND');
    if (evaluation.status !== 'rejected') throw httpError(409, 'Only rejected evaluations can be reopened.', 'NOT_REOPENABLE');
    if (evaluation.cycle_status !== 'active') throw httpError(409, 'The evaluation cycle is not active, so the form cannot be corrected.', 'CYCLE_NOT_ACTIVE');

    await connection.execute("UPDATE evaluations SET status = 'returned' WHERE id = ?", [evaluationId]);
    await connection.execute(
      "INSERT INTO evaluation_reviews (evaluation_id, reviewer_id, action, comment) VALUES (?, ?, 'returned', ?)",
      [evaluationId, Number(req.user.id), `Reopened by administrator: ${comment}`],
    );
    await recomputeInstructorSummary(connection, evaluation.cycle_id, evaluation.instructor_id);
    await writeAudit(connection, {
      userId: Number(req.user.id), action: 'evaluation_reopened', entityType: 'evaluation', entityId: evaluationId,
      details: { comment }, ipAddress: req.ip,
    });
    return { evaluationId, status: 'returned' };
  });
  sendData(res, result);
}));

/* ------------------------------------------------------------------ */
/* Finalize Form E                                                     */
/* ------------------------------------------------------------------ */

router.post('/summaries/:summaryId/finalize', allowRoles(...REVIEW_ROLES), asyncHandler(async (req, res) => {
  const summaryId = parseId(req.params.summaryId, 'summary ID');
  const input = parseBody(finalizeSchema, req.body, 'Both final-comment fields are required.');

  const result = await inTransaction(async (connection) => {
    const summary = await lockSummary(connection, summaryId);
    await assertInScope(connection, req.user, summary.instructor_id);
    if (Number(req.user.id) === Number(summary.instructor_id)) {
      throw httpError(403, 'You cannot finalize your own evaluation.', 'SELF_REVIEW');
    }
    if (['reviewed', 'archived'].includes(summary.status)) {
      throw httpError(409, 'This Form E has already been finalized.', 'ALREADY_FINALIZED');
    }

    // Recalculate from the live data so a stale summary can never be finalized.
    const { form } = await recomputeInstructorSummary(connection, summary.cycle_id, summary.instructor_id);
    if (form.state !== 'approved') {
      const reasons = [];
      if (form.missingGroups.length) reasons.push(`no counted evaluation from: ${form.missingGroups.join(', ')}`);
      for (const item of form.pendingGroups) reasons.push(`${item.assigned - item.submitted} ${item.type} evaluator(s) have not submitted`);
      if (!reasons.length) reasons.push('some submitted forms are not approved yet');
      throw httpError(409, `Form E cannot be finalized yet: ${reasons.join('; ')}.`, 'NOT_READY_TO_FINALIZE');
    }

    await connection.execute(
      `UPDATE evaluation_summaries
          SET committee_strengths = ?, committee_improvements = ?, status = 'reviewed',
              finalized_by = ?, finalized_at = NOW()
        WHERE id = ?`,
      [input.strengths, input.improvements, Number(req.user.id), summaryId],
    );
    await writeAudit(connection, {
      userId: Number(req.user.id), action: 'summary_finalized', entityType: 'evaluation_summary', entityId: summaryId,
      details: { role: req.user.role, totalScore: form.total }, ipAddress: req.ip,
    });
    return { summaryId, status: 'reviewed', totalScore: form.total };
  });
  sendData(res, result);
}));

/* ------------------------------------------------------------------ */
/* Report copies, forwarding and archive (report office)               */
/* ------------------------------------------------------------------ */

router.post('/summaries/:summaryId/distribution/:recipientType/record', allowRoles(REPORT_OFFICE_ROLE), asyncHandler(async (req, res) => {
  const summaryId = parseId(req.params.summaryId, 'summary ID');
  const recipientType = String(req.params.recipientType);
  if (!RECIPIENTS.includes(recipientType)) throw httpError(400, 'Invalid report copy recipient.', 'VALIDATION_ERROR');
  const { note } = parseBody(noteSchema, req.body, 'Invalid note.');

  const result = await inTransaction(async (connection) => {
    const summary = await lockSummary(connection, summaryId);
    if (summary.status !== 'reviewed') {
      throw httpError(409, 'Report copies can only be recorded for a finalized Form E that is not archived yet.', 'NOT_FINALIZED');
    }
    const [existing] = await connection.execute(
      'SELECT status FROM evaluation_report_distributions WHERE summary_id = ? AND recipient_type = ? FOR UPDATE',
      [summaryId, recipientType],
    );
    if (existing[0]?.status === 'recorded') throw httpError(409, 'This copy has already been recorded.', 'ALREADY_RECORDED');

    await connection.execute(
      `INSERT INTO evaluation_report_distributions (summary_id, recipient_type, status, recorded_by, recorded_at, note)
       VALUES (?, ?, 'recorded', ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE status = 'recorded', recorded_by = VALUES(recorded_by), recorded_at = NOW(), note = VALUES(note)`,
      [summaryId, recipientType, Number(req.user.id), note || null],
    );
    await writeAudit(connection, {
      userId: Number(req.user.id), action: 'report_copy_recorded', entityType: 'evaluation_summary', entityId: summaryId,
      details: { recipientType, note: note || null }, ipAddress: req.ip,
    });
    return { summaryId, recipientType, status: 'recorded' };
  });
  sendData(res, result, 201);
}));

router.post('/summaries/:summaryId/forward-to-archive', allowRoles(REPORT_OFFICE_ROLE), asyncHandler(async (req, res) => {
  const summaryId = parseId(req.params.summaryId, 'summary ID');

  const result = await inTransaction(async (connection) => {
    const summary = await lockSummary(connection, summaryId);
    if (summary.status !== 'reviewed') throw httpError(409, 'Only a finalized Form E can be forwarded to the archive.', 'NOT_FINALIZED');

    const [[{ recorded }]] = await connection.query(
      "SELECT COUNT(*) AS recorded FROM evaluation_report_distributions WHERE summary_id = ? AND status = 'recorded' AND recipient_type IN ('teacher', 'department', 'college')",
      [summaryId],
    );
    if (Number(recorded) < RECIPIENTS.length) {
      throw httpError(409, 'Record all three report copies (teacher, department, college) before forwarding.', 'COPIES_INCOMPLETE');
    }
    const [routing] = await connection.execute('SELECT forwarded_at FROM evaluation_report_routing WHERE summary_id = ? FOR UPDATE', [summaryId]);
    if (routing[0]?.forwarded_at) throw httpError(409, 'This report has already been forwarded.', 'ALREADY_FORWARDED');

    await connection.execute(
      `INSERT INTO evaluation_report_routing (summary_id, forwarded_by, forwarded_at) VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE forwarded_by = VALUES(forwarded_by), forwarded_at = NOW()`,
      [summaryId, Number(req.user.id)],
    );
    await writeAudit(connection, {
      userId: Number(req.user.id), action: 'report_forwarded', entityType: 'evaluation_summary', entityId: summaryId,
      details: {}, ipAddress: req.ip,
    });
    return { summaryId, forwarded: true };
  });
  sendData(res, result);
}));

// Archiving is recorded per level by the archive office (see /api/archive), so the report
// office no longer marks a report as archived in one step. The route stays so that an older
// client receives a clear answer instead of a missing-route error.
router.post('/summaries/:summaryId/archive', allowRoles(REPORT_OFFICE_ROLE), asyncHandler(async () => {
  throw httpError(
    409,
    'Archiving is now recorded per level (department, college/school/institute, university) by the archive office.',
    'USE_ARCHIVE_LEVELS',
  );
}));

export default router;