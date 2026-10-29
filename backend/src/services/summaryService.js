// Loads one instructor's evaluations for a cycle, calculates Form E with the
// central scoring service, and stores the result in evaluation_summaries.
// Pass the open transaction connection so the summary stays consistent with
// the evaluation change that triggered it.

import { httpError } from '../utils/http.js';
import { EVALUATOR_TYPES, OFFICIAL_WEIGHTS, SCORING_CONFIG, computeFormE } from '../utils/evaluationSummary.js';
import { buildGroupsInput } from '../utils/formEInput.js';


// Form E state -> evaluation_summaries.status. 'reviewed' (final) is never set here:
// the committee or department head sets it by finalizing Form E with the final comments.
const STATUS_BY_STATE = { incomplete: 'incomplete', complete: 'complete', approved: 'complete' };

async function loadWeights(connection) {
  const [rows] = await connection.execute(
    'SELECT evaluator_type, weight FROM evaluation_forms WHERE is_active = 1',
  );
  const weights = Object.fromEntries(rows.map((row) => [row.evaluator_type, Number(row.weight)]));
  // The four weights are fixed by the official forms: reject any drift in the database.
  for (const type of EVALUATOR_TYPES) {
    if (weights[type] === undefined) {
      throw httpError(409, `The official ${type} evaluation form is missing from the database.`, 'OFFICIAL_FORM_MISSING');
    }
    if (Math.abs(weights[type] - OFFICIAL_WEIGHTS[type]) > 0.0001) {
      throw httpError(409, `The ${type} form must use the official ${OFFICIAL_WEIGHTS[type]}% weight.`, 'OFFICIAL_WEIGHT_MISMATCH');
    }
  }
  return weights;
}

async function loadInputs(connection, cycleId, instructorId) {
  const [assignments] = await connection.execute(
    `SELECT a.id AS assignment_id, a.form_version_id, f.evaluator_type,
            e.id AS evaluation_id, e.status AS evaluation_status
       FROM evaluation_assignments a
       JOIN evaluation_forms f ON f.id = a.form_id
       LEFT JOIN evaluations e ON e.assignment_id = a.id
      WHERE a.cycle_id = ? AND a.instructor_id = ?
      ORDER BY a.id`,
    [cycleId, instructorId],
  );

  const criteriaByVersion = new Map();
  const versionIds = [...new Set(assignments.map((row) => Number(row.form_version_id)))];
  if (versionIds.length) {
    const [criteriaRows] = await connection.query(
      `SELECT s.form_version_id, c.id, s.section_key, s.title
         FROM form_criteria c
         JOIN form_sections s ON s.id = c.section_id
        WHERE s.form_version_id IN (?) AND c.is_active = 1
        ORDER BY s.form_version_id, s.sort_order, s.id, c.sort_order, c.id`,
      [versionIds],
    );
    for (const row of criteriaRows) {
      const key = Number(row.form_version_id);
      if (!criteriaByVersion.has(key)) criteriaByVersion.set(key, []);
      criteriaByVersion.get(key).push({ id: Number(row.id), sectionKey: row.section_key, sectionTitle: row.title });
    }
  }

  const scoresByEvaluation = new Map();
  const evaluationIds = assignments
    .filter((row) => row.evaluation_id && SCORING_CONFIG.countedStatuses.includes(row.evaluation_status))
    .map((row) => Number(row.evaluation_id));
  if (evaluationIds.length) {
    const [scoreRows] = await connection.query(
      'SELECT evaluation_id, criterion_id, score, is_na FROM evaluation_scores WHERE evaluation_id IN (?)',
      [evaluationIds],
    );
    for (const row of scoreRows) {
      const key = Number(row.evaluation_id);
      if (!scoresByEvaluation.has(key)) scoresByEvaluation.set(key, []);
      scoresByEvaluation.get(key).push(row);
    }
  }

  return { assignments, criteriaByVersion, scoresByEvaluation };
}

/**
 * Calculate Form E for one instructor and cycle without writing anything.
 * Also returns the per-evaluation input so reports can show rating counts.
 */
export async function calculateFormEDetailed(connection, cycleId, instructorId) {
  const weights = await loadWeights(connection);
  const inputs = await loadInputs(connection, cycleId, instructorId);
  const groupsInput = buildGroupsInput(inputs);
  const form = computeFormE(groupsInput, { weights });
  if (!form.valid) {
    const reasons = form.issues.map((issue) => issue.message).join(' ');
    throw httpError(500, `Evaluator weights are not configured correctly. ${reasons}`, 'INVALID_WEIGHTS');
  }
  return { form, groupsInput, assignments: inputs.assignments };
}

/** Calculate Form E for one instructor and cycle without writing anything. */
export async function calculateFormE(connection, cycleId, instructorId) {
  return (await calculateFormEDetailed(connection, cycleId, instructorId)).form;
}

/**
 * Recalculate and store the summary row for one instructor and cycle.
 * Call it after any change that can affect a result: a submission, a review
 * (approve, return or reject) or a change to the assigned evaluators.
 * Archived summaries are never changed.
 */
export async function recomputeInstructorSummary(connection, cycleId, instructorId, { finalizedBy = null } = {}) {
  const form = await calculateFormE(connection, cycleId, instructorId);

  const [existing] = await connection.execute(
    'SELECT status FROM evaluation_summaries WHERE cycle_id = ? AND instructor_id = ? FOR UPDATE',
    [cycleId, instructorId],
  );
  if (existing[0]?.status === 'archived') return { form, written: false, status: 'archived' };


  // A finalized summary stays final while every evaluation is still approved. If the data
  // changes afterwards (a new evaluator, a returned form) it drops back and must be finalized again.
  let status = STATUS_BY_STATE[form.state];
  if (form.state === 'approved' && existing[0]?.status === 'reviewed') status = 'reviewed';

  const { student, department_head: head, peer, self } = form.groups;

  // A missing group keeps its average NULL; its weighted column holds 0 only
  // because the column is NOT NULL. Readers must check the average or status.
  await connection.execute(
    `INSERT INTO evaluation_summaries
       (cycle_id, instructor_id, student_average, student_weighted,
        department_head_average, department_head_weighted, peer_average, peer_weighted,
        self_average, self_weighted, total_score, status, finalized_by, finalized_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = 'reviewed', NOW(), NULL))
     ON DUPLICATE KEY UPDATE
       student_average = VALUES(student_average), student_weighted = VALUES(student_weighted),
       department_head_average = VALUES(department_head_average), department_head_weighted = VALUES(department_head_weighted),
       peer_average = VALUES(peer_average), peer_weighted = VALUES(peer_weighted),
       self_average = VALUES(self_average), self_weighted = VALUES(self_weighted),
       total_score = VALUES(total_score), status = VALUES(status),
       finalized_by = IF(VALUES(status) = 'reviewed', COALESCE(evaluation_summaries.finalized_by, VALUES(finalized_by)), NULL),
       finalized_at = IF(VALUES(status) = 'reviewed', COALESCE(evaluation_summaries.finalized_at, VALUES(finalized_at)), NULL)`,
    [
      cycleId, instructorId,
      student.average, student.contribution ?? 0,
      head.average, head.contribution ?? 0,
      peer.average, peer.contribution ?? 0,
      self.average, self.contribution ?? 0,
      form.total ?? 0, status, finalizedBy, status,
    ],
  );
  return { form, written: true, status };
}