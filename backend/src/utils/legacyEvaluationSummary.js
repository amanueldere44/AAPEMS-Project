
import { httpError } from './http.js';

/** Official evaluator-group allocations from Academic Staff Evaluation Forms.docx. */
export const OFFICIAL_WEIGHTS = Object.freeze({
  student: 40,
  department_head: 35,
  peer: 15,
  self: 10,
});

export const REQUIRED_COMPONENTS = Object.freeze(Object.keys(OFFICIAL_WEIGHTS));

const ALLOWED_NA_POLICIES = new Set(['exclude', 'zero']);
const configuredNaPolicy = String(process.env.ASEMS_NA_SCORING_POLICY || 'exclude').toLowerCase();
if (!ALLOWED_NA_POLICIES.has(configuredNaPolicy)) {
  throw new Error('ASEMS_NA_SCORING_POLICY must be either "exclude" or "zero".');
}
export const NA_SCORING_POLICY = configuredNaPolicy;
export const NA_POLICY_IS_PROVISIONAL = !process.env.ASEMS_NA_SCORING_POLICY;

/**
 * No category-level weights are specified by the supplied official form.
 * Keep category weighted results unallocated until the institution confirms a rule.
 */
export const CATEGORY_WEIGHTING_POLICY = 'unconfigured';

const rounded = (value, digits = 3) => Number(Number(value).toFixed(digits));

function fail(statusCode, message, code) {
  throw httpError(statusCode, message, code);
}

function normalizedResponse(row) {
  const isNa = row.is_na === true || Number(row.is_na) === 1 || row.score === 'NA';
  if (isNa) return 'NA';
  if (row.score === null || row.score === undefined || row.score === '') {
    fail(400, `Criterion ${row.criterion_id ?? row.criterionId} has no score.`, 'MISSING_SCORE');
  }
  const score = Number(row.score);
  if (!Number.isInteger(score) || score < 0 || score > 5) {
    fail(400, `Criterion ${row.criterion_id ?? row.criterionId} must be rated from 0 to 5 or NA.`, 'INVALID_SCORE');
  }
  return score;
}

/**
 * Pure, deterministic validation/calculation used by submissions and tests.
 * Zero is a valid numeric score. NA handling is explicitly configurable.
 */
export function calculateEvaluationScore(criteria, scoreRows, weight, naPolicy = NA_SCORING_POLICY) {
  if (!Array.isArray(criteria) || !Array.isArray(scoreRows)) {
    fail(400, 'Criteria and score responses must be arrays.', 'INVALID_SCORE_PAYLOAD');
  }
  if (!ALLOWED_NA_POLICIES.has(naPolicy)) {
    fail(500, 'The configured NA scoring policy is invalid.', 'INVALID_NA_POLICY');
  }
  const normalizedWeight = Number(weight);
  if (!Number.isFinite(normalizedWeight) || normalizedWeight < 0 || normalizedWeight > 100) {
    fail(409, 'The evaluation form has an unsupported weight.', 'INVALID_FORM_WEIGHT');
  }

  const allowedIds = new Set(criteria.map((criterion) => Number(criterion.id ?? criterion.criterion_id ?? criterion.criterionId)));
  const responses = new Map();
  for (const row of scoreRows) {
    const id = Number(row.criterion_id ?? row.criterionId);
    if (!Number.isSafeInteger(id) || !allowedIds.has(id)) {
      fail(400, `Criterion ${id || '(unknown)'} does not belong to this form.`, 'INVALID_CRITERION');
    }
    if (responses.has(id)) fail(400, `Criterion ${id} was answered more than once.`, 'DUPLICATE_CRITERION');
    responses.set(id, normalizedResponse(row));
  }

  const missing = [...allowedIds].filter((id) => !responses.has(id));
  if (missing.length) {
    fail(400, `Complete every criterion before submitting. ${missing.length} response(s) are missing.`, 'INCOMPLETE_EVALUATION');
  }

  const values = [...responses.values()];
  const numericValues = values.filter((value) => value !== 'NA');
  if (!numericValues.length) {
    fail(400, 'At least one numeric score is required; NA is not a numeric zero.', 'NO_NUMERIC_SCORES');
  }

  const countedValues = naPolicy === 'zero'
    ? values.map((value) => value === 'NA' ? 0 : value)
    : numericValues;
  const sum = countedValues.reduce((total, value) => total + value, 0);
  const average = sum / countedValues.length;
  const weighted = average * normalizedWeight / 5;

  return {
    average: rounded(average),
    weighted: rounded(weighted),
    numericCount: numericValues.length,
    naCount: values.length - numericValues.length,
    answeredCount: values.length,
    denominator: countedValues.length,
    naPolicy,
    provisionalNaPolicy: NA_POLICY_IS_PROVISIONAL,
  };
}

export function getScoringConfiguration() {
  return {
    naPolicy: NA_SCORING_POLICY,
    naPolicyIsProvisional: NA_POLICY_IS_PROVISIONAL,
    categoryWeightingPolicy: CATEGORY_WEIGHTING_POLICY,
    officialWeights: { ...OFFICIAL_WEIGHTS },
  };
}

/** Read the database configuration and reject drift from the official weights. */
export async function verifyOfficialWeights(connection) {
  const [rows] = await connection.execute(
    'SELECT code, evaluator_type, weight FROM evaluation_forms ORDER BY code',
  );
  const byType = new Map(rows.map((row) => [row.evaluator_type, row]));
  for (const type of REQUIRED_COMPONENTS) {
    const row = byType.get(type);
    if (!row) {
      fail(409, `The official ${type} evaluation form is missing from the database.`, 'OFFICIAL_FORM_MISSING');
    }
    if (Math.abs(Number(row.weight) - OFFICIAL_WEIGHTS[type]) > 0.0001) {
      fail(409, `The ${type} form must use the official ${OFFICIAL_WEIGHTS[type]}% weight.`, 'OFFICIAL_WEIGHT_MISMATCH');
    }
  }
  return { ...OFFICIAL_WEIGHTS };
}

/**
 * Recompute the instructor-level Form E header fields.
 * A summary is complete only when every assignment has been submitted/approved
 * and every official evaluator group is represented. Missing assignments never
 * become a score of zero in the user-facing report.
 */
export async function recomputeInstructorSummary(connection, cycleId, instructorId) {
  const weights = await verifyOfficialWeights(connection);
  const [componentRows] = await connection.execute(
    `SELECT f.evaluator_type, AVG(e.overall_average) AS component_average,
            COUNT(DISTINCT a.id) AS evaluated_assignments
       FROM evaluation_assignments a
       JOIN evaluation_forms f ON f.id = a.form_id
       JOIN evaluations e ON e.assignment_id = a.id
      WHERE a.cycle_id = ? AND a.instructor_id = ?
        AND e.status IN ('submitted', 'approved')
        AND e.overall_average IS NOT NULL
      GROUP BY f.evaluator_type`,
    [cycleId, instructorId],
  );
  const byType = new Map(componentRows.map((row) => {
    const type = row.evaluator_type;
    const rawAverage = Number(row.component_average);
    const average = rounded(rawAverage);
    return [type, {
      average,
      weighted: rounded(rawAverage * weights[type] / 5),
      evaluatedAssignments: Number(row.evaluated_assignments),
    }];
  }));

  const [assignmentRows] = await connection.execute(
    `SELECT COUNT(*) AS total_assignments,
            COALESCE(SUM(CASE WHEN e.status IN ('submitted', 'approved') THEN 1 ELSE 0 END), 0) AS completed_assignments,
            COUNT(DISTINCT CASE WHEN e.status IN ('submitted', 'approved') THEN f.evaluator_type END) AS submitted_component_types
       FROM evaluation_assignments a
       JOIN evaluation_forms f ON f.id = a.form_id
       LEFT JOIN evaluations e ON e.assignment_id = a.id
      WHERE a.cycle_id = ? AND a.instructor_id = ?`,
    [cycleId, instructorId],
  );
  const stats = assignmentRows[0] ?? {};
  const totalAssignments = Number(stats.total_assignments ?? 0);
  const completedAssignments = Number(stats.completed_assignments ?? 0);
  const hasEveryComponent = REQUIRED_COMPONENTS.every((type) => byType.has(type));
  const complete = totalAssignments > 0
    && totalAssignments === completedAssignments
    && hasEveryComponent
    && Number(stats.submitted_component_types ?? 0) === REQUIRED_COMPONENTS.length;

  const student = byType.get('student');
  const head = byType.get('department_head');
  const peer = byType.get('peer');
  const self = byType.get('self');
  const total = complete
    ? REQUIRED_COMPONENTS.reduce((sum, type) => sum + byType.get(type).weighted, 0)
    : 0;

  await connection.execute(
    `INSERT INTO evaluation_summaries
       (cycle_id, instructor_id, student_average, student_weighted,
        department_head_average, department_head_weighted, peer_average, peer_weighted,
        self_average, self_weighted, total_score, status, finalized_by, finalized_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
     ON DUPLICATE KEY UPDATE
       student_average = VALUES(student_average), student_weighted = VALUES(student_weighted),
       department_head_average = VALUES(department_head_average), department_head_weighted = VALUES(department_head_weighted),
       peer_average = VALUES(peer_average), peer_weighted = VALUES(peer_weighted),
       self_average = VALUES(self_average), self_weighted = VALUES(self_weighted),
       total_score = VALUES(total_score), status = VALUES(status), finalized_by = NULL, finalized_at = NULL`,
    [
      cycleId, instructorId,
      student?.average ?? null, student?.weighted ?? 0,
      head?.average ?? null, head?.weighted ?? 0,
      peer?.average ?? null, peer?.weighted ?? 0,
      self?.average ?? null, self?.weighted ?? 0,
      rounded(total), complete ? 'complete' : 'incomplete',
    ],
  );

  return {
    complete,
    totalAssignments,
    completedAssignments,
    componentsPresent: REQUIRED_COMPONENTS.filter((type) => byType.has(type)),
    componentsMissing: REQUIRED_COMPONENTS.filter((type) => !byType.has(type)),
    totalScore: complete ? rounded(total) : null,
  };
}

/**
 * Build Form E from live rows using the same official weight configuration.
 * Category weighted contributions intentionally stay null: the official forms
 * name categories but do not define a numeric weight for each category.
 */
export async function getFormESummary(connection, summaryId) {
  const id = Number(summaryId);
  const [summaryRows] = await connection.execute(
    `SELECT s.id, s.cycle_id, s.instructor_id, s.student_average, s.student_weighted,
            s.department_head_average, s.department_head_weighted, s.peer_average, s.peer_weighted,
            s.self_average, s.self_weighted, s.total_score, s.status,
            s.committee_strengths, s.committee_improvements, s.finalized_by, s.finalized_at,
            u.name AS instructor_name,
            cy.title AS cycle_title, cy.academic_year, cy.start_date, cy.end_date,
            dept.id AS department_id, dept.name AS department_name,
            faculty.id AS faculty_id, faculty.name AS faculty_name,
            finalizer.name AS finalized_by_name
       FROM evaluation_summaries s
       JOIN users u ON u.id = s.instructor_id
       JOIN evaluation_cycles cy ON cy.id = s.cycle_id
       LEFT JOIN employees target_employee ON target_employee.user_id = s.instructor_id
       LEFT JOIN departments dept ON dept.id = target_employee.department_id
       LEFT JOIN faculties faculty ON faculty.id = dept.faculty_id
       LEFT JOIN users finalizer ON finalizer.id = s.finalized_by
      WHERE s.id = ? LIMIT 1`,
    [id],
  );
  const summary = summaryRows[0];
  if (!summary) fail(404, 'Evaluation summary not found.', 'NOT_FOUND');

  const weights = await verifyOfficialWeights(connection);
  const [categoryRows] = await connection.execute(
    `SELECT f.code AS form_code, f.title AS form_title, f.evaluator_type, f.weight,
            fs.id AS section_id, fs.section_key AS section_code, fs.title AS section_title,
            fs.sort_order AS section_order, c.id AS criterion_id, c.text AS criterion_text,
            c.sort_order AS criterion_order, a.id AS assignment_id,
            e.id AS evaluation_id, e.status AS evaluation_status,
            es.score, es.is_na
       FROM evaluation_assignments a
       JOIN evaluation_forms f ON f.id = a.form_id
       JOIN form_sections fs ON fs.form_version_id = a.form_version_id
       LEFT JOIN form_criteria c ON c.section_id = fs.id AND c.is_active = 1
       LEFT JOIN evaluations e ON e.assignment_id = a.id AND e.status IN ('submitted', 'approved')
       LEFT JOIN evaluation_scores es ON es.evaluation_id = e.id AND es.criterion_id = c.id
      WHERE a.cycle_id = ? AND a.instructor_id = ?
      ORDER BY f.code, fs.sort_order, c.sort_order, a.id`,
    [summary.cycle_id, summary.instructor_id],
  );
  // If one evaluator group has no assignments yet, still display its published
  // category headings in Form E. Missing ratings remain null rather than zero.
  const [catalogRows] = await connection.execute(
    `SELECT f.code AS form_code, f.title AS form_title, f.evaluator_type, f.weight,
            fs.id AS section_id, fs.section_key AS section_code, fs.title AS section_title,
            fs.sort_order AS section_order, c.id AS criterion_id, c.sort_order AS criterion_order
       FROM evaluation_forms f
       JOIN form_versions fv ON fv.form_id = f.id AND fv.status = 'published'
       JOIN form_sections fs ON fs.form_version_id = fv.id
       LEFT JOIN form_criteria c ON c.section_id = fs.id AND c.is_active = 1
      WHERE f.is_active = 1
      ORDER BY f.code, fs.sort_order, c.sort_order`,
  );

  const [assignmentMeta] = await connection.execute(
    `SELECT COUNT(*) AS total_assignments,
            COALESCE(SUM(e.status IN ('submitted', 'approved')), 0) AS submitted_assignments,
            COALESCE(SUM(e.status = 'approved'), 0) AS approved_assignments,
            GROUP_CONCAT(DISTINCT NULLIF(a.course_title, '') ORDER BY a.course_title SEPARATOR ' | ') AS course_titles,
            GROUP_CONCAT(DISTINCT NULLIF(a.course_code, '') ORDER BY a.course_code SEPARATOR ', ') AS course_codes,
            GROUP_CONCAT(DISTINCT a.batch ORDER BY a.batch SEPARATOR ', ') AS batches,
            GROUP_CONCAT(DISTINCT a.semester ORDER BY a.semester SEPARATOR ', ') AS semesters,
            MAX(e.submitted_at) AS last_submitted_at
       FROM evaluation_assignments a
       LEFT JOIN evaluations e ON e.assignment_id = a.id
      WHERE a.cycle_id = ? AND a.instructor_id = ?`,
    [summary.cycle_id, summary.instructor_id],
  );

  const [distributionRows] = await connection.execute(
    `SELECT d.recipient_type, d.status, d.recorded_at, d.note,
            d.recorded_by, recorder.name AS recorded_by_name
       FROM evaluation_report_distributions d
       LEFT JOIN users recorder ON recorder.id = d.recorded_by
      WHERE d.summary_id = ?
      ORDER BY FIELD(d.recipient_type, 'teacher', 'department', 'college')`,
    [id],
  );
  const [routingRows] = await connection.execute(
    `SELECT r.forwarded_by, r.forwarded_at, r.archived_by, r.archived_at,
            r.archive_reference, forwarder.name AS forwarded_by_name,
            archiver.name AS archived_by_name
       FROM evaluation_report_routing r
       LEFT JOIN users forwarder ON forwarder.id = r.forwarded_by
       LEFT JOIN users archiver ON archiver.id = r.archived_by
      WHERE r.summary_id = ? LIMIT 1`,
    [id],
  );

  const groups = new Map();
  for (const row of categoryRows) {
    const key = row.evaluator_type;
    if (!groups.has(key)) groups.set(key, {
      evaluatorType: key,
      formCode: row.form_code,
      formTitle: row.form_title,
      weight: weights[key],
      average: summary[`${key}_average`] === null ? null : Number(summary[`${key}_average`]),
      weightedContribution: summary[`${key}_weighted`] === null ? null : Number(summary[`${key}_weighted`]),
      categories: new Map(),
    });
    const group = groups.get(key);
    if (!group.categories.has(Number(row.section_id))) {
      group.categories.set(Number(row.section_id), {
        sectionId: Number(row.section_id),
        code: row.section_code,
        title: row.section_title,
        order: Number(row.section_order),
        criterionIds: new Set(),
        ratings: [],
        naCount: 0,
        submittedEvaluationIds: new Set(),
      });
    }
    const category = group.categories.get(Number(row.section_id));
    if (row.criterion_id !== null) category.criterionIds.add(Number(row.criterion_id));
    if (row.evaluation_id !== null) category.submittedEvaluationIds.add(Number(row.evaluation_id));
    if (row.criterion_id !== null && row.evaluation_id !== null && row.score !== null && Number(row.is_na) !== 1) {
      category.ratings.push(Number(row.score));
    } else if (row.criterion_id !== null && row.evaluation_id !== null && Number(row.is_na) === 1) {
      category.naCount += 1;
      if (NA_SCORING_POLICY === 'zero') category.ratings.push(0);
    }
  }

  const components = REQUIRED_COMPONENTS.map((type) => {
    const group = groups.get(type);
    if (!group) {
      const templateRows = catalogRows.filter((row) => row.evaluator_type === type);
      const categoryTemplates = new Map();
      for (const row of templateRows) {
        const sectionId = Number(row.section_id);
        if (!categoryTemplates.has(sectionId)) {
          categoryTemplates.set(sectionId, {
            sectionId,
            code: row.section_code,
            title: row.section_title,
            order: Number(row.section_order),
            criterionIds: new Set(),
          });
        }
        if (row.criterion_id !== null) categoryTemplates.get(sectionId).criterionIds.add(Number(row.criterion_id));
      }
      const template = templateRows[0];
      return {
        evaluatorType: type,
        formCode: template?.form_code ?? ({ student: 'A', department_head: 'B', peer: 'C', self: 'D' })[type],
        formTitle: template?.form_title ?? null,
        weight: weights[type],
        average: summary[`${type}_average`] === null ? null : Number(summary[`${type}_average`]),
        weightedContribution: summary[`${type}_average`] === null ? null : Number(summary[`${type}_weighted`]),
        categories: [...categoryTemplates.values()].sort((a, b) => a.order - b.order).map((category) => ({
          sectionId: category.sectionId,
          code: category.code,
          title: category.title,
          criterionCount: category.criterionIds.size,
          evaluatedForms: 0,
          ratingCount: 0,
          naCount: 0,
          average: null,
          weightedContribution: null,
          remark: null,
          weightingNote: 'No category-level numerical weights are specified in the supplied official form.',
        })),
      };
    }
    const categories = [...group.categories.values()].sort((a, b) => a.order - b.order).map((category) => ({
      sectionId: category.sectionId,
      code: category.code,
      title: category.title,
      criterionCount: category.criterionIds.size,
      evaluatedForms: category.submittedEvaluationIds.size,
      ratingCount: category.ratings.length,
      naCount: category.naCount,
      average: category.ratings.length
        ? rounded(category.ratings.reduce((sum, value) => sum + value, 0) / category.ratings.length)
        : null,
      weightedContribution: null,
      remark: null,
      weightingNote: 'No category-level numerical weights are specified in the supplied official form.',
    }));
    return { ...group, categories };
  });

  const meta = assignmentMeta[0] ?? {};
  const dataCompleteness = {
    status: summary.status,
    isComplete: summary.status !== 'incomplete',
    isFinal: ['reviewed', 'archived'].includes(summary.status),
    totalAssignments: Number(meta.total_assignments ?? 0),
    submittedAssignments: Number(meta.submitted_assignments ?? 0),
    approvedAssignments: Number(meta.approved_assignments ?? 0),
  };

  const warnings = [];
  if (NA_POLICY_IS_PROVISIONAL) {
    warnings.push('NA scoring currently uses the provisional "exclude" policy. Confirm the institutional rule and set ASEMS_NA_SCORING_POLICY explicitly before production.');
  }
  warnings.push('Multiple evaluator submissions are currently combined using an arithmetic mean of their form averages. The supplied documents do not specify a multi-evaluator aggregation method; confirm this policy before production.');
  warnings.push('The current database stores one summary per instructor and cycle, while Form E includes course metadata. Confirm whether institutional reporting requires one report per instructor/cycle or a separate report per course.');
  warnings.push('Category-level weighted contributions and category remarks are not calculated because the supplied official form does not define category weights or remark bands.');
  warnings.push('The current SQL seed places six Form D criteria under "Performing Non-instructional Duties". Confirm this mapping against the official Form D wording before treating it as authoritative.');

  return {
    summary: {
      id: Number(summary.id),
      cycleId: Number(summary.cycle_id),
      cycleTitle: summary.cycle_title,
      academicYear: summary.academic_year,
      startDate: summary.start_date,
      endDate: summary.end_date,
      departmentId: summary.department_id === null ? null : Number(summary.department_id),
      departmentName: summary.department_name,
      facultyId: summary.faculty_id === null ? null : Number(summary.faculty_id),
      facultyName: summary.faculty_name,
      instructorId: Number(summary.instructor_id),
      instructorName: summary.instructor_name,
      status: summary.status,
      totalScore: ['reviewed', 'archived'].includes(summary.status) ? Number(summary.total_score) : null,
      rawTotalScore: Number(summary.total_score),
      finalizedBy: summary.finalized_by === null ? null : Number(summary.finalized_by),
      finalizedByName: summary.finalized_by_name,
      finalizedAt: summary.finalized_at,
      finalComments: {
        strengths: summary.committee_strengths,
        improvements: summary.committee_improvements,
      },
    },
    metadata: {
      courseTitles: meta.course_titles,
      courseCodes: meta.course_codes,
      batches: meta.batches,
      semesters: meta.semesters,
      evaluationDate: meta.last_submitted_at,
      finalizedAt: summary.finalized_at,
    },
    components,
    overall: {
      totalScore: ['reviewed', 'archived'].includes(summary.status) ? Number(summary.total_score) : null,
      maxScore: 100,
      status: summary.status,
    },
    completeness: dataCompleteness,
    scoringConfiguration: getScoringConfiguration(),
    warnings,
    distribution: distributionRows.map((row) => ({
      recipientType: row.recipient_type,
      status: row.status,
      recordedAt: row.recorded_at,
      recordedBy: row.recorded_by === null ? null : Number(row.recorded_by),
      recordedByName: row.recorded_by_name,
      note: row.note,
    })),
    routing: routingRows[0] ? {
      forwardedAt: routingRows[0].forwarded_at,
      forwardedBy: routingRows[0].forwarded_by === null ? null : Number(routingRows[0].forwarded_by),
      forwardedByName: routingRows[0].forwarded_by_name,
      archivedAt: routingRows[0].archived_at,
      archivedBy: routingRows[0].archived_by === null ? null : Number(routingRows[0].archived_by),
      archivedByName: routingRows[0].archived_by_name,
      archiveReference: routingRows[0].archive_reference,
    } : null,
    copyRequirements: [
      { recipientType: 'teacher', label: 'Teacher' },
      { recipientType: 'department', label: 'Department' },
      { recipientType: 'college', label: 'College / Institute / School' },
    ],
  };
}
