import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireAuth } from '../middlewares/auth.js';
import { asyncHandler, httpError, sendData } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

const assignmentSelect = `
  SELECT a.id, a.cycle_id, cy.title AS cycle_title, cy.academic_year, cy.status AS cycle_status,
         a.form_id, a.form_version_id, f.code AS form_code, f.title AS form_title, f.evaluator_type, f.weight,
         a.instructor_id, instructor.name AS instructor_name,
         a.evaluator_id, evaluator.name AS evaluator_name,
         a.course_title, a.course_code, a.batch, a.semester, a.status,
         e.id AS evaluation_id, e.status AS evaluation_status, e.submitted_at,
         e.comment_strengths, e.comment_improvements
    FROM evaluation_assignments a
    JOIN evaluation_cycles cy ON cy.id = a.cycle_id
    JOIN evaluation_forms f ON f.id = a.form_id
    JOIN users instructor ON instructor.id = a.instructor_id
    JOIN users evaluator ON evaluator.id = a.evaluator_id
    LEFT JOIN evaluations e ON e.assignment_id = a.id`;

// Administrators run the evaluation process but are not evaluators: they never read the answers or
// comments of an evaluation. They may list assignments (who evaluates whom, and the status) without comments.
router.get('/', asyncHandler(async (req, res) => {
  const values = [];
  let where = '';
  if (req.user.role !== 'admin') {
    where = ' WHERE a.evaluator_id = ?';
    values.push(Number(req.user.id));
  }
  const [rows] = await pool.execute(`${assignmentSelect}${where} ORDER BY a.created_at DESC`, values);
  sendData(
    res,
    req.user.role === 'admin'
      ? rows.map(({ comment_strengths: _s, comment_improvements: _i, ...rest }) => rest)
      : rows,
  );
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw httpError(400, 'Invalid assignment ID.', 'VALIDATION_ERROR');
  if (req.user.role === 'admin') {
    throw httpError(403, 'Administrators cannot open the answers of an evaluation.', 'ADMIN_CANNOT_VIEW_EVALUATION');
  }
  const [rows] = await pool.execute(
    `${assignmentSelect} WHERE a.id = ? AND a.evaluator_id = ? LIMIT 1`,
    [id, Number(req.user.id)],
  );
  const assignment = rows[0];
  if (!assignment) throw httpError(404, 'Assignment not found.', 'NOT_FOUND');

  let scores = [];
  if (assignment.evaluation_id) {
    const [scoreRows] = await pool.execute(
      `SELECT es.criterion_id, es.score, es.is_na
         FROM evaluation_scores es WHERE es.evaluation_id = ?`,
      [assignment.evaluation_id]
    );
    scores = scoreRows;
  }
  sendData(res, { ...assignment, scores });
}));

export default router;