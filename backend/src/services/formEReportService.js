// Builds the Form E report for one evaluation summary.
//
// Every number (group averages, category averages, contributions, total) comes
// from the central scoring service via calculateFormEDetailed(), so the report
// always agrees with the dashboard, the approval checks and the stored summary.
// The response keeps the shape of the previous getFormESummary() so the
// frontend keeps working; new fields are only added.

import { httpError } from '../utils/http.js';
import { EVALUATOR_TYPES, SCORING_CONFIG, UNCONFIRMED_CATEGORIES } from '../utils/evaluationSummary.js';
import { calculateFormEDetailed } from './summaryService.js';

const FORM_CODES = { student: 'A', department_head: 'B', peer: 'C', self: 'D' };
const FINAL_STATUSES = ['reviewed', 'archived'];
const CATEGORY_NOTE = 'Category contributions share the group weight equally per criterion (provisional rule: the official form defines no category weights).';

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

export async function getFormESummary(connection, summaryId) {
  const id = Number(summaryId);
  const [summaryRows] = await connection.execute(
    `SELECT s.id, s.cycle_id, s.instructor_id, s.total_score, s.status,
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
  if (!summary) throw httpError(404, 'Evaluation summary not found.', 'NOT_FOUND');

  const { form, groupsInput } = await calculateFormEDetailed(connection, summary.cycle_id, summary.instructor_id);

  const [formRows] = await connection.execute(
    'SELECT code, title, evaluator_type FROM evaluation_forms WHERE is_active = 1',
  );
  const formsByType = new Map(formRows.map((row) => [row.evaluator_type, row]));

  // Published headings: used for section ids and for groups that have no result yet.
  const [catalogRows] = await connection.execute(
    `SELECT f.evaluator_type, fs.id AS section_id, fs.section_key, fs.title AS section_title,
            fs.sort_order, COUNT(c.id) AS criterion_count
       FROM evaluation_forms f
       JOIN form_versions fv ON fv.form_id = f.id AND fv.status = 'published'
       JOIN form_sections fs ON fs.form_version_id = fv.id
       LEFT JOIN form_criteria c ON c.section_id = fs.id AND c.is_active = 1
      WHERE f.is_active = 1
      GROUP BY f.evaluator_type, fs.id, fs.section_key, fs.title, fs.sort_order
      ORDER BY f.evaluator_type, fs.sort_order, fs.id`,
  );
  const catalog = new Map();
  for (const row of catalogRows) {
    if (!catalog.has(row.evaluator_type)) catalog.set(row.evaluator_type, []);
    catalog.get(row.evaluator_type).push(row);
  }

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

  const components = EVALUATOR_TYPES.map((type) => {
    const group = form.groups[type];
    const formRow = formsByType.get(type);
    const sections = catalog.get(type) ?? [];
    const sectionByKey = new Map(sections.map((row) => [row.section_key, row]));

    // Rating counts per category, taken from the evaluations that were actually counted.
    const tally = new Map();
    for (const evaluation of groupsInput[type].evaluations) {
      if (!evaluation.ok || !SCORING_CONFIG.countedStatuses.includes(evaluation.status)) continue;
      for (const category of evaluation.categories) {
        const entry = tally.get(category.key) ?? { ratings: 0, na: 0 };
        entry.ratings += category.counted;
        entry.na += category.naCount;
        tally.set(category.key, entry);
      }
    }

    const categories = group.status === 'available'
      ? group.categories.map((category) => ({
        sectionId: toNumber(sectionByKey.get(category.key)?.section_id),
        code: category.key,
        title: category.title,
        criterionCount: category.criteriaCount,
        evaluatedForms: group.evaluatorCount,
        ratingCount: tally.get(category.key)?.ratings ?? 0,
        naCount: tally.get(category.key)?.na ?? 0,
        average: category.average,
        weightedContribution: category.contribution,
        remark: null,
        unconfirmedMapping: (UNCONFIRMED_CATEGORIES[type] ?? []).includes(category.key),
        weightingNote: CATEGORY_NOTE,
      }))
      : sections.map((row) => ({
        sectionId: Number(row.section_id),
        code: row.section_key,
        title: row.section_title,
        criterionCount: Number(row.criterion_count),
        evaluatedForms: 0,
        ratingCount: 0,
        naCount: 0,
        average: null,
        weightedContribution: null,
        remark: null,
        unconfirmedMapping: (UNCONFIRMED_CATEGORIES[type] ?? []).includes(row.section_key),
        weightingNote: CATEGORY_NOTE,
      }));

    return {
      evaluatorType: type,
      formCode: formRow?.code ?? FORM_CODES[type],
      formTitle: formRow?.title ?? null,
      weight: form.weights[type],
      maxContribution: group.maxContribution,
      status: group.status,
      evaluatorCount: group.evaluatorCount,
      assignedCount: group.assignedCount,
      approvedCount: group.approvedCount,
      average: group.average,
      weightedContribution: group.contribution,
      categories,
    };
  });

  const meta = assignmentMeta[0] ?? {};
  const isFinal = FINAL_STATUSES.includes(summary.status) && form.state === 'approved';
  const storedTotal = Number(summary.total_score);
  const integrityMatches = form.total === null ? storedTotal === 0 : Math.abs(storedTotal - form.total) < 0.0005;

  const warnings = [
    `NA answers are ${SCORING_CONFIG.naPolicy === 'zero' ? 'counted as 0' : 'left out of the average'}. This rule is provisional; confirm the institutional policy before production.`,
    'Evaluators within a group (for example several students) count equally: the group result is the mean of the individual evaluation results. The supplied documents do not specify this; confirm it before production.',
    'Category contributions share each group\'s weight equally per criterion. The official form defines no category weights; group totals and the overall result do not depend on this rule. Category remarks are not calculated because no remark bands are defined.',
    'The database stores one summary per instructor and cycle, while Form E includes course details. Confirm whether reporting needs one report per instructor and cycle or one per course.',
    'Six Form D criteria are listed under "Performing Non-instructional Duties" in the database. The official Form D text has no such heading. Confirm this mapping before treating it as authoritative.',
  ];
  for (const pending of form.pendingGroups) {
    warnings.push(`${pending.assigned - pending.submitted} of ${pending.assigned} assigned ${pending.type.replace('_', ' ')} evaluator(s) have not submitted a counted evaluation.`);
  }
  if (form.excluded.length) {
    warnings.push(`${form.excluded.length} evaluation(s) are not counted because they are draft, returned or rejected.`);
  }
  if (FINAL_STATUSES.includes(summary.status) && form.state !== 'approved') {
    warnings.push('The stored summary is marked as final, but the live data is no longer fully approved. Do not treat this report as final.');
  }
  if (!integrityMatches) {
    warnings.push('The stored summary total differs from the live calculation. Run the summary refresh (scripts/recomputeSummaries.js) before relying on stored values.');
  }

  return {
    summary: {
      id: Number(summary.id),
      cycleId: Number(summary.cycle_id),
      cycleTitle: summary.cycle_title,
      academicYear: summary.academic_year,
      startDate: summary.start_date,
      endDate: summary.end_date,
      departmentId: toNumber(summary.department_id),
      departmentName: summary.department_name,
      facultyId: toNumber(summary.faculty_id),
      facultyName: summary.faculty_name,
      instructorId: Number(summary.instructor_id),
      instructorName: summary.instructor_name,
      status: summary.status,
      totalScore: isFinal ? form.total : null,
      rawTotalScore: storedTotal,
      finalizedBy: toNumber(summary.finalized_by),
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
      totalScore: isFinal ? form.total : null,
      liveTotal: form.total,
      partialTotal: form.partialTotal,
      maxScore: form.maxTotal,
      status: summary.status,
      state: form.state,
    },
    completeness: {
      status: summary.status,
      isComplete: form.complete,
      isFinal,
      state: form.state,
      missingGroups: form.missingGroups,
      pendingGroups: form.pendingGroups,
      totalAssignments: Number(meta.total_assignments ?? 0),
      submittedAssignments: Number(meta.submitted_assignments ?? 0),
      approvedAssignments: Number(meta.approved_assignments ?? 0),
    },
    integrity: { storedTotal, liveTotal: form.total, matches: integrityMatches },
    scoringConfiguration: {
      naPolicy: SCORING_CONFIG.naPolicy,
      naPolicyIsProvisional: true,
      categoryWeightingPolicy: 'equal-per-criterion (provisional)',
      officialWeights: { ...form.weights },
    },
    warnings,
    distribution: distributionRows.map((row) => ({
      recipientType: row.recipient_type,
      status: row.status,
      recordedAt: row.recorded_at,
      recordedBy: toNumber(row.recorded_by),
      recordedByName: row.recorded_by_name,
      note: row.note,
    })),
    routing: routingRows[0] ? {
      forwardedAt: routingRows[0].forwarded_at,
      forwardedBy: toNumber(routingRows[0].forwarded_by),
      forwardedByName: routingRows[0].forwarded_by_name,
      archivedAt: routingRows[0].archived_at,
      archivedBy: toNumber(routingRows[0].archived_by),
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