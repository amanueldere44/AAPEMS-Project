import { z } from 'zod';
import { pool } from '../config/database.js';
import { httpError } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';
import { inTransaction, parseBody } from '../utils/db.js';

/**
 * Leadership evaluations, kept separate from the instructor workflow:
 *   - dean / vice dean evaluates a department head
 *   - academic affairs VP / vice director evaluates a dean
 *
 * No criteria, scale, weights or scoring formula are defined here. An
 * administrator enters the criteria and scale of each form version; the only
 * scoring checks are "every active criterion answered" and "inside the scale".
 */

export const LEADERSHIP_TYPES = Object.freeze({
  dean_evaluates_department_head: Object.freeze({
    evaluatorRole: 'dean',
    evaluateeRole: 'department_head',
    defaultTitle: 'Dean evaluates Department Head',
  }),
  vp_evaluates_dean: Object.freeze({
    evaluatorRole: 'academic_vp',
    evaluateeRole: 'dean',
    defaultTitle: 'Academic Affairs VP evaluates Dean',
  }),
});

const TYPE_KEYS = Object.keys(LEADERSHIP_TYPES);

function assertType(type) {
  if (!TYPE_KEYS.includes(type)) {
    throw httpError(404, 'Unknown leadership evaluation type.', 'NOT_FOUND');
  }
  return LEADERSHIP_TYPES[type];
}

/* ------------------------------------------------------------------ */
/* Validation schemas                                                  */
/* ------------------------------------------------------------------ */

const versionSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    instructions: z.string().trim().max(10000).nullable().optional(),
    scaleMin: z.number().int().min(0).max(254),
    scaleMax: z.number().int().min(1).max(255),
    allowNa: z.boolean(),
    criteria: z
      .array(
        z.object({
          sectionTitle: z.string().trim().max(255).nullable().optional(),
          text: z.string().trim().min(1).max(600),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine((v) => v.scaleMin < v.scaleMax, {
    message: 'scaleMin must be lower than scaleMax.',
    path: ['scaleMax'],
  });

const assignmentSchema = z
  .object({
    cycleId: z.number().int().positive(),
    type: z.enum(TYPE_KEYS),
    evaluatorId: z.number().int().positive(),
    evaluateeId: z.number().int().positive(),
  })
  .refine((v) => v.evaluatorId !== v.evaluateeId, {
    message: 'A person cannot evaluate themselves.',
    path: ['evaluateeId'],
  });

const answersSchema = z.object({
  scores: z
    .array(
      z.object({
        criterionId: z.number().int().positive(),
        score: z.number().int().min(0).nullable().optional(),
        isNa: z.boolean().optional().default(false),
      }),
    )
    .max(500)
    .optional()
    .default([]),
  commentStrengths: z.string().trim().max(10000).nullable().optional(),
  commentImprovements: z.string().trim().max(10000).nullable().optional(),
});

const listQuerySchema = z.object({
  cycleId: z.coerce.number().int().positive().optional(),
  type: z.enum(TYPE_KEYS).optional(),
  status: z.enum(['draft', 'submitted']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/* ------------------------------------------------------------------ */
/* Form versions (administrator)                                       */
/* ------------------------------------------------------------------ */

function criteriaRows(versionId, criteria) {
  return criteria.map((c, index) => [
    versionId,
    c.sectionTitle || null,
    c.text,
    index + 1,
  ]);
}

export async function listForms() {
  const [rows] = await pool.query(
    `SELECT f.id AS formId, f.evaluation_type AS type, f.title, f.is_active AS isActive,
            v.id AS versionId, v.version_no AS versionNo, v.status,
            v.scale_min AS scaleMin, v.scale_max AS scaleMax, v.allow_na AS allowNa,
            v.published_at AS publishedAt,
            (SELECT COUNT(*) FROM leadership_criteria c
              WHERE c.form_version_id = v.id AND c.is_active = 1) AS criteriaCount
       FROM leadership_forms f
       LEFT JOIN leadership_form_versions v ON v.form_id = f.id
      ORDER BY f.evaluation_type, v.version_no DESC`,
  );

  const forms = TYPE_KEYS.map((type) => ({
    type,
    evaluatorRole: LEADERSHIP_TYPES[type].evaluatorRole,
    evaluateeRole: LEADERSHIP_TYPES[type].evaluateeRole,
    title: LEADERSHIP_TYPES[type].defaultTitle,
    versions: [],
  }));

  for (const row of rows) {
    const form = forms.find((f) => f.type === row.type);
    if (!form) continue;
    form.title = row.title;
    if (row.versionId) {
      form.versions.push({
        versionId: Number(row.versionId),
        versionNo: row.versionNo,
        status: row.status,
        scaleMin: row.scaleMin,
        scaleMax: row.scaleMax,
        allowNa: Boolean(row.allowNa),
        publishedAt: row.publishedAt,
        criteriaCount: Number(row.criteriaCount),
      });
    }
  }
  return forms;
}

export async function createVersion(user, type, body, ipAddress) {
  const typeInfo = assertType(type);
  const data = parseBody(versionSchema, body, 'Invalid form version.');

  return inTransaction(async (connection) => {
    await connection.execute(
      'INSERT IGNORE INTO leadership_forms (evaluation_type, title) VALUES (?, ?)',
      [type, data.title || typeInfo.defaultTitle],
    );
    const [[form]] = await connection.execute(
      'SELECT id FROM leadership_forms WHERE evaluation_type = ? FOR UPDATE',
      [type],
    );
    if (data.title) {
      await connection.execute('UPDATE leadership_forms SET title = ? WHERE id = ?', [
        data.title,
        form.id,
      ]);
    }

    const [[{ nextNo }]] = await connection.execute(
      'SELECT COALESCE(MAX(version_no), 0) + 1 AS nextNo FROM leadership_form_versions WHERE form_id = ?',
      [form.id],
    );
    const [inserted] = await connection.execute(
      `INSERT INTO leadership_form_versions
         (form_id, version_no, status, instructions, scale_min, scale_max, allow_na, created_by)
       VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [
        form.id,
        nextNo,
        data.instructions || null,
        data.scaleMin,
        data.scaleMax,
        data.allowNa ? 1 : 0,
        Number(user.id),
      ],
    );
    const versionId = Number(inserted.insertId);
    await connection.query(
      'INSERT INTO leadership_criteria (form_version_id, section_title, text, sort_order) VALUES ?',
      [criteriaRows(versionId, data.criteria)],
    );
    await writeAudit(connection, {
      userId: Number(user.id),
      action: 'leadership_form_version_created',
      entityType: 'leadership_form_version',
      entityId: versionId,
      details: { type, versionNo: nextNo, criteria: data.criteria.length },
      ipAddress,
    });
    return { versionId, type, versionNo: nextNo, status: 'draft' };
  });
}

export async function getVersion(versionId) {
  const [rows] = await pool.execute(
    `SELECT v.id, f.evaluation_type AS type, f.title, v.version_no AS versionNo, v.status,
            v.instructions, v.scale_min AS scaleMin, v.scale_max AS scaleMax,
            v.allow_na AS allowNa, v.published_at AS publishedAt
       FROM leadership_form_versions v
       JOIN leadership_forms f ON f.id = v.form_id
      WHERE v.id = ?`,
    [versionId],
  );
  if (!rows[0]) throw httpError(404, 'Form version not found.', 'NOT_FOUND');
  const [criteria] = await pool.execute(
    `SELECT id, section_title AS sectionTitle, text, sort_order AS sortOrder
       FROM leadership_criteria
      WHERE form_version_id = ? AND is_active = 1
      ORDER BY sort_order, id`,
    [versionId],
  );
  return {
    ...rows[0],
    id: Number(rows[0].id),
    allowNa: Boolean(rows[0].allowNa),
    criteria: criteria.map((c) => ({ ...c, id: Number(c.id) })),
  };
}

export async function updateVersion(user, versionId, body, ipAddress) {
  const data = parseBody(versionSchema, body, 'Invalid form version.');

  return inTransaction(async (connection) => {
    const [[version]] = await connection.execute(
      'SELECT id, form_id, status FROM leadership_form_versions WHERE id = ? FOR UPDATE',
      [versionId],
    );
    if (!version) throw httpError(404, 'Form version not found.', 'NOT_FOUND');
    if (version.status !== 'draft') {
      throw httpError(409, 'Only a draft version can be edited. Create a new version instead.', 'NOT_DRAFT');
    }

    await connection.execute(
      `UPDATE leadership_form_versions
          SET instructions = ?, scale_min = ?, scale_max = ?, allow_na = ?
        WHERE id = ?`,
      [data.instructions || null, data.scaleMin, data.scaleMax, data.allowNa ? 1 : 0, versionId],
    );
    if (data.title) {
      await connection.execute('UPDATE leadership_forms SET title = ? WHERE id = ?', [
        data.title,
        version.form_id,
      ]);
    }
    await connection.execute('DELETE FROM leadership_criteria WHERE form_version_id = ?', [versionId]);
    await connection.query(
      'INSERT INTO leadership_criteria (form_version_id, section_title, text, sort_order) VALUES ?',
      [criteriaRows(versionId, data.criteria)],
    );
    await writeAudit(connection, {
      userId: Number(user.id),
      action: 'leadership_form_version_updated',
      entityType: 'leadership_form_version',
      entityId: versionId,
      details: { criteria: data.criteria.length },
      ipAddress,
    });
    return { versionId, status: 'draft' };
  });
}

export async function publishVersion(user, versionId, ipAddress) {
  return inTransaction(async (connection) => {
    // Lock the form row first so concurrent create/publish calls take locks in the same order.
    const [[head]] = await connection.execute(
      'SELECT form_id FROM leadership_form_versions WHERE id = ?',
      [versionId],
    );
    if (!head) throw httpError(404, 'Form version not found.', 'NOT_FOUND');
    await connection.execute('SELECT id FROM leadership_forms WHERE id = ? FOR UPDATE', [head.form_id]);

    const [[version]] = await connection.execute(
      'SELECT id, form_id, status FROM leadership_form_versions WHERE id = ? FOR UPDATE',
      [versionId],
    );
    if (version.status !== 'draft') {
      throw httpError(409, 'Only a draft version can be published.', 'NOT_DRAFT');
    }
    const [[{ total }]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM leadership_criteria WHERE form_version_id = ? AND is_active = 1',
      [versionId],
    );
    if (Number(total) < 1) {
      throw httpError(409, 'A version needs at least one criterion before it can be published.', 'NO_CRITERIA');
    }

    await connection.execute(
      "UPDATE leadership_form_versions SET status = 'retired' WHERE form_id = ? AND status = 'published'",
      [version.form_id],
    );
    await connection.execute(
      "UPDATE leadership_form_versions SET status = 'published', published_by = ?, published_at = NOW() WHERE id = ?",
      [Number(user.id), versionId],
    );
    await writeAudit(connection, {
      userId: Number(user.id),
      action: 'leadership_form_version_published',
      entityType: 'leadership_form_version',
      entityId: versionId,
      details: {},
      ipAddress,
    });
    return { versionId, status: 'published' };
  });
}

/* ------------------------------------------------------------------ */
/* Assignments (administrator)                                         */
/* ------------------------------------------------------------------ */

export async function listCandidates(type) {
  const info = assertType(type);
  const [evaluators] = await pool.execute(
    "SELECT id, name FROM users WHERE role = ? AND status = 'active' ORDER BY name",
    [info.evaluatorRole],
  );
  const [evaluatees] = await pool.execute(
    `SELECT u.id, u.name, d.name AS departmentName
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE u.role = ? AND u.status = 'active'
      ORDER BY u.name`,
    [info.evaluateeRole],
  );
  const clean = (r) => ({ ...r, id: Number(r.id) });
  return {
    type,
    evaluatorRole: info.evaluatorRole,
    evaluateeRole: info.evaluateeRole,
    evaluators: evaluators.map(clean),
    evaluatees: evaluatees.map(clean),
  };
}

export async function createAssignment(user, body, ipAddress) {
  const data = parseBody(assignmentSchema, body, 'Invalid assignment.');
  const info = LEADERSHIP_TYPES[data.type];

  return inTransaction(async (connection) => {
    const [[cycle]] = await connection.execute(
      'SELECT id, status FROM evaluation_cycles WHERE id = ?',
      [data.cycleId],
    );
    if (!cycle) throw httpError(404, 'Evaluation cycle not found.', 'NOT_FOUND');
    if (cycle.status === 'closed') {
      throw httpError(409, 'This evaluation cycle is closed.', 'CYCLE_CLOSED');
    }

    for (const [label, id, role] of [
      ['evaluator', data.evaluatorId, info.evaluatorRole],
      ['evaluatee', data.evaluateeId, info.evaluateeRole],
    ]) {
      const [[person]] = await connection.execute('SELECT role, status FROM users WHERE id = ?', [id]);
      if (!person || person.status !== 'active' || person.role !== role) {
        throw httpError(422, `The ${label} must be an active user with the role "${role}".`, 'INVALID_PARTICIPANT');
      }
    }

    const [[published]] = await connection.execute(
      `SELECT v.id
         FROM leadership_form_versions v
         JOIN leadership_forms f ON f.id = v.form_id
        WHERE f.evaluation_type = ? AND v.status = 'published'
        LIMIT 1`,
      [data.type],
    );
    if (!published) {
      throw httpError(409, 'Publish a form version for this evaluation type first.', 'NO_PUBLISHED_FORM');
    }

    let insertedId;
    try {
      const [inserted] = await connection.execute(
        `INSERT INTO leadership_evaluations
           (cycle_id, evaluation_type, form_version_id, evaluator_id, evaluatee_id)
         VALUES (?, ?, ?, ?, ?)`,
        [data.cycleId, data.type, published.id, data.evaluatorId, data.evaluateeId],
      );
      insertedId = Number(inserted.insertId);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw httpError(409, 'This evaluation is already assigned for the cycle.', 'ALREADY_ASSIGNED');
      }
      throw error;
    }

    await writeAudit(connection, {
      userId: Number(user.id),
      action: 'leadership_evaluation_assigned',
      entityType: 'leadership_evaluation',
      entityId: insertedId,
      details: { type: data.type, cycleId: data.cycleId, evaluatorId: data.evaluatorId, evaluateeId: data.evaluateeId },
      ipAddress,
    });
    return { id: insertedId, status: 'draft' };
  });
}

export async function deleteAssignment(user, evaluationId, ipAddress) {
  return inTransaction(async (connection) => {
    const [[evaluation]] = await connection.execute(
      'SELECT id, status, evaluation_type, cycle_id FROM leadership_evaluations WHERE id = ? FOR UPDATE',
      [evaluationId],
    );
    if (!evaluation) throw httpError(404, 'Evaluation not found.', 'NOT_FOUND');
    if (evaluation.status !== 'draft') {
      throw httpError(409, 'A submitted evaluation cannot be removed.', 'ALREADY_SUBMITTED');
    }
    await connection.execute('DELETE FROM leadership_evaluations WHERE id = ?', [evaluationId]);
    await writeAudit(connection, {
      userId: Number(user.id),
      action: 'leadership_evaluation_removed',
      entityType: 'leadership_evaluation',
      entityId: evaluationId,
      details: { type: evaluation.evaluation_type, cycleId: Number(evaluation.cycle_id) },
      ipAddress,
    });
    return { id: evaluationId, removed: true };
  });
}

/* ------------------------------------------------------------------ */
/* Listing and reading                                                 */
/* ------------------------------------------------------------------ */

const EVALUATION_SELECT = `
  SELECT le.id, le.cycle_id AS cycleId, cy.title AS cycleTitle, cy.academic_year AS academicYear,
         cy.status AS cycleStatus, le.evaluation_type AS type, le.form_version_id AS formVersionId,
         le.evaluator_id AS evaluatorId, ev.name AS evaluatorName,
         le.evaluatee_id AS evaluateeId, ee.name AS evaluateeName,
         le.status, le.comment_strengths AS commentStrengths,
         le.comment_improvements AS commentImprovements,
         le.submitted_at AS submittedAt, le.created_at AS createdAt, le.updated_at AS updatedAt
    FROM leadership_evaluations le
    JOIN evaluation_cycles cy ON cy.id = le.cycle_id
    JOIN users ev ON ev.id = le.evaluator_id
    JOIN users ee ON ee.id = le.evaluatee_id`;

// Administrators see every evaluation; evaluators see only their own.
export async function listEvaluations(user, query) {
  const q = parseBody(listQuerySchema, query, 'Invalid filter.');
  const where = [];
  const params = [];
  if (user.role !== 'admin') {
    where.push('le.evaluator_id = ?');
    params.push(Number(user.id));
  }
  if (q.cycleId) { where.push('le.cycle_id = ?'); params.push(q.cycleId); }
  if (q.type) { where.push('le.evaluation_type = ?'); params.push(q.type); }
  if (q.status) { where.push('le.status = ?'); params.push(q.status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM leadership_evaluations le ${clause}`,
    params,
  );
  const [rows] = await pool.query(
    `${EVALUATION_SELECT}
      ${clause}
      ORDER BY le.updated_at DESC, le.id DESC
      LIMIT ? OFFSET ?`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize],
  );

  const ids = rows.map((r) => Number(r.id));
  const progress = new Map();
  if (ids.length) {
    const [counts] = await pool.query(
      `SELECT le.id,
              (SELECT COUNT(*) FROM leadership_criteria c
                WHERE c.form_version_id = le.form_version_id AND c.is_active = 1) AS totalCriteria,
              (SELECT COUNT(*) FROM leadership_scores s
                 JOIN leadership_criteria c ON c.id = s.criterion_id AND c.is_active = 1
                WHERE s.evaluation_id = le.id) AS answeredCriteria
         FROM leadership_evaluations le
        WHERE le.id IN (?)`,
      [ids],
    );
    for (const c of counts) progress.set(Number(c.id), c);
  }

  return {
    items: rows.map((r) => ({
      ...r,
      id: Number(r.id),
      cycleId: Number(r.cycleId),
      evaluatorId: Number(r.evaluatorId),
      evaluateeId: Number(r.evaluateeId),
      totalCriteria: Number(progress.get(Number(r.id))?.totalCriteria ?? 0),
      answeredCriteria: Number(progress.get(Number(r.id))?.answeredCriteria ?? 0),
    })),
    page: q.page,
    pageSize: q.pageSize,
    total: Number(total),
  };
}

// Out-of-scope records are reported as "not found" so their existence is not revealed.
export async function getEvaluation(user, evaluationId) {
  const [rows] = await pool.execute(`${EVALUATION_SELECT} WHERE le.id = ?`, [evaluationId]);
  const evaluation = rows[0];
  if (!evaluation || (user.role !== 'admin' && Number(evaluation.evaluatorId) !== Number(user.id))) {
    throw httpError(404, 'Evaluation not found.', 'NOT_FOUND');
  }

  const [[version]] = await pool.execute(
    `SELECT id, version_no AS versionNo, instructions, scale_min AS scaleMin,
            scale_max AS scaleMax, allow_na AS allowNa
       FROM leadership_form_versions WHERE id = ?`,
    [evaluation.formVersionId],
  );
  const [criteria] = await pool.execute(
    `SELECT c.id, c.section_title AS sectionTitle, c.text, s.id AS scoreId, s.score, s.is_na AS isNa
       FROM leadership_criteria c
       LEFT JOIN leadership_scores s ON s.criterion_id = c.id AND s.evaluation_id = ?
      WHERE c.form_version_id = ? AND c.is_active = 1
      ORDER BY c.sort_order, c.id`,
    [evaluationId, evaluation.formVersionId],
  );

  return {
    ...evaluation,
    id: Number(evaluation.id),
    cycleId: Number(evaluation.cycleId),
    evaluatorId: Number(evaluation.evaluatorId),
    evaluateeId: Number(evaluation.evaluateeId),
    form: {
      versionId: Number(version.id),
      versionNo: version.versionNo,
      instructions: version.instructions,
      scaleMin: version.scaleMin,
      scaleMax: version.scaleMax,
      allowNa: Boolean(version.allowNa),
    },
    criteria: criteria.map((c) => ({
      id: Number(c.id),
      sectionTitle: c.sectionTitle,
      text: c.text,
      answered: c.scoreId !== null,
      score: c.score,
      isNa: Boolean(c.isNa),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Evaluator: save draft and submit                                    */
/* ------------------------------------------------------------------ */

async function lockOwnEvaluation(connection, user, evaluationId) {
  const [rows] = await connection.execute(
    `SELECT le.id, le.status, le.evaluator_id, le.evaluatee_id, le.evaluation_type, le.cycle_id,
            le.form_version_id, cy.status AS cycle_status,
            v.scale_min, v.scale_max, v.allow_na
       FROM leadership_evaluations le
       JOIN evaluation_cycles cy ON cy.id = le.cycle_id
       JOIN leadership_form_versions v ON v.id = le.form_version_id
      WHERE le.id = ?
        FOR UPDATE OF le`,
    [evaluationId],
  );
  const evaluation = rows[0];
  // Only the assigned evaluator may change an evaluation; everyone else gets "not found".
  if (!evaluation || Number(evaluation.evaluator_id) !== Number(user.id)) {
    throw httpError(404, 'Evaluation not found.', 'NOT_FOUND');
  }
  if (evaluation.status === 'submitted') {
    throw httpError(409, 'This evaluation has already been submitted and can no longer be changed.', 'ALREADY_SUBMITTED');
  }
  if (evaluation.cycle_status !== 'active') {
    throw httpError(409, 'The evaluation cycle is not active.', 'CYCLE_NOT_ACTIVE');
  }
  return evaluation;
}

async function applyAnswers(connection, evaluation, answers) {
  const [criteria] = await connection.execute(
    'SELECT id FROM leadership_criteria WHERE form_version_id = ? AND is_active = 1',
    [evaluation.form_version_id],
  );
  const valid = new Set(criteria.map((c) => Number(c.id)));
  const seen = new Set();
  const rows = [];

  for (const answer of answers.scores) {
    if (seen.has(answer.criterionId)) {
      throw httpError(400, `Criterion ${answer.criterionId} appears more than once.`, 'VALIDATION_ERROR');
    }
    seen.add(answer.criterionId);
    if (!valid.has(answer.criterionId)) {
      throw httpError(400, `Criterion ${answer.criterionId} does not belong to this form.`, 'VALIDATION_ERROR');
    }
    if (answer.isNa) {
      if (!evaluation.allow_na) {
        throw httpError(400, 'Not-applicable answers are not allowed on this form.', 'VALIDATION_ERROR');
      }
      if (answer.score !== null && answer.score !== undefined) {
        throw httpError(400, 'A not-applicable answer cannot carry a score.', 'VALIDATION_ERROR');
      }
      rows.push([evaluation.id, answer.criterionId, null, 1]);
    } else {
      if (answer.score === null || answer.score === undefined) {
        throw httpError(400, 'A score is required unless the criterion is marked not applicable.', 'VALIDATION_ERROR');
      }
      if (answer.score < evaluation.scale_min || answer.score > evaluation.scale_max) {
        throw httpError(
          400,
          `Scores must be between ${evaluation.scale_min} and ${evaluation.scale_max}.`,
          'VALIDATION_ERROR',
        );
      }
      rows.push([evaluation.id, answer.criterionId, answer.score, 0]);
    }
  }

  if (rows.length) {
    await connection.query(
      `INSERT INTO leadership_scores (evaluation_id, criterion_id, score, is_na) VALUES ?
       ON DUPLICATE KEY UPDATE score = VALUES(score), is_na = VALUES(is_na)`,
      [rows],
    );
  }

  const sets = [];
  const params = [];
  if (answers.commentStrengths !== undefined) { sets.push('comment_strengths = ?'); params.push(answers.commentStrengths); }
  if (answers.commentImprovements !== undefined) { sets.push('comment_improvements = ?'); params.push(answers.commentImprovements); }
  if (sets.length) {
    await connection.execute(`UPDATE leadership_evaluations SET ${sets.join(', ')} WHERE id = ?`, [...params, evaluation.id]);
  }
}

export async function saveDraft(user, evaluationId, body) {
  const answers = parseBody(answersSchema, body, 'Invalid answers.');
  return inTransaction(async (connection) => {
    const evaluation = await lockOwnEvaluation(connection, user, evaluationId);
    await applyAnswers(connection, evaluation, answers);
    return { id: evaluationId, status: 'draft' };
  });
}

export async function submitEvaluation(user, evaluationId, body, ipAddress) {
  const answers = parseBody(answersSchema, body, 'Invalid answers.');
  return inTransaction(async (connection) => {
    const evaluation = await lockOwnEvaluation(connection, user, evaluationId);
    await applyAnswers(connection, evaluation, answers);

    const [[{ total, answered }]] = await connection.execute(
      `SELECT COUNT(*) AS total, COUNT(s.id) AS answered
         FROM leadership_criteria c
         LEFT JOIN leadership_scores s ON s.criterion_id = c.id AND s.evaluation_id = ?
        WHERE c.form_version_id = ? AND c.is_active = 1`,
      [evaluationId, evaluation.form_version_id],
    );
    if (Number(answered) < Number(total)) {
      throw httpError(
        422,
        `${Number(total) - Number(answered)} of ${Number(total)} criteria are still unanswered.`,
        'INCOMPLETE_EVALUATION',
      );
    }

    await connection.execute(
      "UPDATE leadership_evaluations SET status = 'submitted', submitted_at = NOW() WHERE id = ?",
      [evaluationId],
    );
    await writeAudit(connection, {
      userId: Number(user.id),
      action: 'leadership_evaluation_submitted',
      entityType: 'leadership_evaluation',
      entityId: evaluationId,
      details: {
        type: evaluation.evaluation_type,
        cycleId: Number(evaluation.cycle_id),
        evaluateeId: Number(evaluation.evaluatee_id),
      },
      ipAddress,
    });
    return { id: evaluationId, status: 'submitted' };
  });
}