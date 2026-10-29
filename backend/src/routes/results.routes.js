import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, sendData } from '../utils/http.js';

// Teachers see ONLY their own results, and only once every component has been
// approved through the whole workflow (summary status = 'reviewed').
// Evaluators are never identified. Set to false if comments must stay private.
const SHARE_COMMENTS = true;
const TYPES = ['student', 'department_head', 'peer', 'self'];

const router = Router();
router.use(requireAuth, allowRoles('teacher'));

const num = (value) => (value === null || value === undefined ? null : Number(value));

// GET /api/results/me
router.get('/me', asyncHandler(async (req, res) => {
  const instructorId = Number(req.user.id);

  const [progressRows] = await pool.execute(
    `SELECT a.cycle_id, cy.title AS cycle_title, cy.academic_year, cy.status AS cycle_status,
            f.evaluator_type,
            COUNT(*) AS total,
            COALESCE(SUM(e.status IN ('submitted', 'approved')), 0) AS submitted,
            COALESCE(SUM(e.status = 'approved'), 0) AS approved
       FROM evaluation_assignments a
       JOIN evaluation_cycles cy ON cy.id = a.cycle_id
       JOIN evaluation_forms f ON f.id = a.form_id
       LEFT JOIN evaluations e ON e.assignment_id = a.id
      WHERE a.instructor_id = ?
      GROUP BY a.cycle_id, cy.title, cy.academic_year, cy.status, cy.start_date, f.evaluator_type
      ORDER BY cy.start_date DESC`,
    [instructorId],
  );

  const [weightRows] = await pool.execute(
    'SELECT evaluator_type, weight FROM evaluation_forms WHERE is_active = 1',
  );
  const weights = Object.fromEntries(weightRows.map((row) => [row.evaluator_type, Number(row.weight)]));

  const [summaryRows] = await pool.execute(
    `SELECT cycle_id, student_average, student_weighted, department_head_average,
            department_head_weighted, peer_average, peer_weighted, self_average,
            self_weighted, total_score, status, finalized_at
       FROM evaluation_summaries WHERE instructor_id = ?`,
    [instructorId],
  );
  const summaries = new Map(summaryRows.map((row) => [Number(row.cycle_id), row]));

  const commentsByCycle = new Map();
  if (SHARE_COMMENTS) {
    // RAND() so the order cannot reveal who submitted first.
    const [commentRows] = await pool.execute(
      `SELECT a.cycle_id, f.evaluator_type, e.comment_strengths, e.comment_improvements
         FROM evaluations e
         JOIN evaluation_assignments a ON a.id = e.assignment_id
         JOIN evaluation_forms f ON f.id = a.form_id
        WHERE a.instructor_id = ? AND e.status = 'approved'
        ORDER BY RAND()`,
      [instructorId],
    );
    commentRows.forEach((row) => {
      const key = Number(row.cycle_id);
      if (!commentsByCycle.has(key)) commentsByCycle.set(key, { strengths: [], improvements: [] });
      const bucket = commentsByCycle.get(key);
      if (row.comment_strengths?.trim()) bucket.strengths.push({ type: row.evaluator_type, text: row.comment_strengths.trim() });
      if (row.comment_improvements?.trim()) bucket.improvements.push({ type: row.evaluator_type, text: row.comment_improvements.trim() });
    });
  }

  const cycles = new Map();
  progressRows.forEach((row) => {
    const id = Number(row.cycle_id);
    if (!cycles.has(id)) {
      cycles.set(id, {
        cycleId: id,
        cycleTitle: row.cycle_title,
        academicYear: row.academic_year,
        cycleStatus: row.cycle_status,
        progress: {},
      });
    }
    cycles.get(id).progress[row.evaluator_type] = {
      total: Number(row.total),
      submitted: Number(row.submitted),
      approved: Number(row.approved),
    };
  });

  const results = [...cycles.values()].map((cycle) => {
    const summary = summaries.get(cycle.cycleId);

    // Results stay visible after the report has been archived.
    const released = ['reviewed', 'archived'].includes(summary?.status);    
    const base = { ...cycle, released, scores: null, comments: null };
    if (!released) return base;

    const components = {};
    TYPES.forEach((type) => {
      components[type] = {
        average: num(summary[`${type}_average`]),
        weighted: num(summary[`${type}_weighted`]),
        weight: weights[type] ?? null,
      };
    });

    return {
      ...base,
      scores: {
        components,
        total: num(summary.total_score),
        maxTotal: TYPES.reduce((sum, type) => sum + (weights[type] ?? 0), 0),
        finalizedAt: summary.finalized_at,
      },
      comments: SHARE_COMMENTS ? commentsByCycle.get(cycle.cycleId) ?? { strengths: [], improvements: [] } : null,
    };
  });

  sendData(res, { results });
}));

export default router;