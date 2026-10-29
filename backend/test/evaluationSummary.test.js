import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVALUATOR_TYPES,
  OFFICIAL_WEIGHTS,
  computeFormE,
  getFinalizationBlockers,
  responsesFromRows,
  roundTo,
  scoreEvaluation,
  validateResponses,
  validateScore,
} from '../src/utils/evaluationSummary.js';

// Official section titles and criterion counts (Academic Staff Evaluation Forms, Forms A-D).
const FORMS = {
  student: [['Instructional Skills', 15], ['Professional Ethics and Attitude Towards Students', 8], ['Assessment Methods and Feedback', 7]],
  department_head: [['Core Competency', 11], ['Professional Competency', 7], ['Time Management', 4], ['Ethical Competence', 5]],
  peer: [['Subject Matter Competency', 4], ['Research and Community Services', 5], ['Professional Competency', 7], ['Ethical Competence', 8], ['Time Management', 2]],
  self: [['Instructional Skills', 15], ['Professional Ethics and Attitude Towards Students', 8], ['Assessment Methods and Feedback', 9], ['Overall Personal Behavior', 9], ['Professional Attitude', 14], ['Interpersonal Relationship Capability', 7]],
};

function buildCriteria(type) {
  let id = { student: 100, department_head: 200, peer: 300, self: 400 }[type];
  const criteria = [];
  FORMS[type].forEach(([title, count], index) => {
    for (let i = 0; i < count; i += 1) {
      id += 1;
      criteria.push({ id, sectionKey: `${type}-${index + 1}`, sectionTitle: title });
    }
  });
  return criteria;
}

const CRITERIA = Object.fromEntries(EVALUATOR_TYPES.map((type) => [type, buildCriteria(type)]));
const answerAll = (type, score) => CRITERIA[type].map((c) => ({ criterionId: c.id, score }));
const evaluation = (type, score, status = 'approved', id = `${type}-${score}-${status}`) => ({ id, evaluatorType: type, status, responses: answerAll(type, score) });
const allGroups = (score, status = 'approved') => EVALUATOR_TYPES.map((type) => evaluation(type, score, status));

test('official criterion counts match the forms (30 / 27 / 26 / 62)', () => {
  assert.equal(CRITERIA.student.length, 30);
  assert.equal(CRITERIA.department_head.length, 27);
  assert.equal(CRITERIA.peer.length, 26);
  assert.equal(CRITERIA.self.length, 62);
});

test('official weights are 40/35/15/10 and add up to 100', () => {
  assert.deepEqual({ ...OFFICIAL_WEIGHTS }, { student: 40, department_head: 35, peer: 15, self: 10 });
  assert.equal(Object.values(OFFICIAL_WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test('perfect scores give exactly each group weight and 100 in total', () => {
  const result = computeFormE({ evaluations: allGroups(5), criteriaByType: CRITERIA });
  assert.equal(result.groups.student.contribution, 40);
  assert.equal(result.groups.department_head.contribution, 35);
  assert.equal(result.groups.peer.contribution, 15);
  assert.equal(result.groups.self.contribution, 10);
  assert.equal(result.total, 100);
  assert.equal(result.maxTotal, 100);
  assert.equal(result.status, 'final');
  assert.equal(result.isFinal, true);
});

test('a group can never exceed its weight', () => {
  for (const type of EVALUATOR_TYPES) {
    const scored = scoreEvaluation({ evaluatorType: type, criteria: CRITERIA[type], responses: answerAll(type, 5) });
    assert.ok(scored.weighted <= OFFICIAL_WEIGHTS[type]);
  }
});

test('zero is a real score, not a missing answer', () => {
  const scored = scoreEvaluation({ evaluatorType: 'student', criteria: CRITERIA.student, responses: answerAll('student', 0) });
  assert.equal(scored.complete, true);
  assert.equal(scored.average, 0);
  assert.equal(scored.weighted, 0);
  assert.equal(scored.counted, 30);

  const result = computeFormE({ evaluations: [evaluation('student', 0), ...allGroups(5).slice(1)], criteriaByType: CRITERIA });
  assert.equal(result.groups.student.contribution, 0);
  assert.equal(result.total, 60);
});

test('N/A is excluded from the average under the provisional "exclude" policy', () => {
  const responses = answerAll('student', 4);
  responses[0].score = 'NA';
  const scored = scoreEvaluation({ evaluatorType: 'student', criteria: CRITERIA.student, responses });
  assert.equal(scored.naCount, 1);
  assert.equal(scored.counted, 29);
  assert.equal(scored.average, 4);
  assert.equal(scored.weighted, 32);
});

test('N/A counts as zero when the policy is switched to "zero"', () => {
  const responses = answerAll('student', 4);
  responses[0].score = 'NA';
  const scored = scoreEvaluation({ evaluatorType: 'student', criteria: CRITERIA.student, responses, config: { naPolicy: 'zero' } });
  assert.equal(scored.counted, 30);
  assert.equal(roundTo(scored.average, 3), roundTo(116 / 30, 3));
});

test('invalid and malformed scores are rejected', () => {
  const scale = { scaleMin: 0, scaleMax: 5, allowNa: true };
  for (const bad of [6, -1, 3.5, '3', null, undefined, NaN, true, 'na', {}]) {
    assert.ok(validateScore(bad, scale), `should reject ${String(bad)}`);
  }
  for (const good of [0, 1, 2, 3, 4, 5, 'NA']) {
    assert.equal(validateScore(good, scale), null);
  }
  assert.ok(validateScore('NA', { ...scale, allowNa: false }));
});

test('duplicate, unknown and malformed responses are reported', () => {
  const criteria = CRITERIA.student;
  const check = validateResponses(
    [{ criterionId: criteria[0].id, score: 3 }, { criterionId: criteria[0].id, score: 4 }, { criterionId: 99999, score: 3 }, { criterionId: criteria[1].id, score: 9 }, null],
    criteria,
    { scaleMin: 0, scaleMax: 5, allowNa: true },
  );
  const codes = check.errors.map((e) => e.code).sort();
  assert.deepEqual(codes, ['DUPLICATE_CRITERION', 'INVALID_SCORE', 'MALFORMED_RESPONSE', 'UNKNOWN_CRITERION']);
  assert.equal(check.valid, false);
});

test('a missing evaluator group is never converted to zero', () => {
  const result = computeFormE({ evaluations: allGroups(5).filter((e) => e.evaluatorType !== 'peer'), criteriaByType: CRITERIA });
  assert.equal(result.groups.peer.status, 'missing');
  assert.equal(result.groups.peer.contribution, null);
  assert.equal(result.total, null);
  assert.equal(result.partialTotal, 85);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.completeness.missingGroups, ['peer']);
});

test('pending, draft, returned and rejected tasks are distinguishable and not scored', () => {
  const evaluations = [
    ...allGroups(5),
    { id: 'p', evaluatorType: 'student', status: 'pending', responses: [] },
    { id: 'd', evaluatorType: 'student', status: 'draft', responses: answerAll('student', 0) },
    { id: 'r', evaluatorType: 'student', status: 'returned', responses: answerAll('student', 0) },
  ];
  const result = computeFormE({ evaluations, criteriaByType: CRITERIA });
  assert.equal(result.groups.student.contribution, 40);
  assert.equal(result.groups.student.unresolved, 3);
  assert.deepEqual(result.groups.student.statusCounts, { approved: 1, pending: 1, draft: 1, returned: 1 });
  assert.equal(result.completeness.complete, false);
  assert.equal(result.isFinal, false);
  assert.ok(getFinalizationBlockers(result).length > 0);
});

test('submitted but not yet approved evaluations are provisional, not final', () => {
  const result = computeFormE({ evaluations: allGroups(4, 'submitted'), criteriaByType: CRITERIA });
  assert.equal(result.status, 'provisional');
  assert.equal(result.isFinal, false);
  assert.equal(result.total, 80);
  assert.equal(getFinalizationBlockers(result).length, 4);
});

test('several students count equally (mean of evaluators)', () => {
  const evaluations = [...allGroups(5).filter((e) => e.evaluatorType !== 'student'), evaluation('student', 5, 'approved', 's1'), evaluation('student', 3, 'approved', 's2')];
  const result = computeFormE({ evaluations, criteriaByType: CRITERIA });
  assert.equal(result.groups.student.counted, 2);
  assert.equal(result.groups.student.average, 4);
  assert.equal(result.groups.student.contribution, 32);
});

test('category contributions add up to the group total and to the overall total', () => {
  const evaluations = allGroups(5).map((e) => {
    const responses = e.responses.map((r, index) => ({ ...r, score: (index % 6) }));
    return { ...e, responses };
  });
  const result = computeFormE({ evaluations, criteriaByType: CRITERIA });
  let overall = 0;
  for (const type of EVALUATOR_TYPES) {
    const group = result.groups[type];
    const sum = group.categories.reduce((s, c) => s + (c.contribution ?? 0), 0);
    assert.ok(Math.abs(sum - group.contribution) < 0.005, `${type}: ${sum} vs ${group.contribution}`);
    overall += group.contribution;
  }
  assert.ok(Math.abs(overall - result.total) < 0.005);
  assert.equal(result.issues.filter((i) => i.code === 'RECONCILIATION_MISMATCH').length, 0);
});

test('Form E category rows follow the official names and order', () => {
  const result = computeFormE({ evaluations: allGroups(5), criteriaByType: CRITERIA });
  assert.deepEqual(result.groups.student.categories.map((c) => c.key), ['instructional_skills', 'ethics_attitude', 'assessment_feedback']);
  assert.deepEqual(result.groups.department_head.categories.map((c) => c.key), ['core_competency', 'professional_competency', 'time_management', 'ethical_competency']);
  assert.equal(result.groups.peer.categories.length, 5);
});

test('the self-evaluation "non-instructional duties" row is flagged, not invented', () => {
  const result = computeFormE({ evaluations: allGroups(5), criteriaByType: CRITERIA });
  const row = result.groups.self.categories.find((c) => c.key === 'non_instructional_duties');
  assert.equal(row.mapped, false);
  assert.equal(row.average, null);
  assert.equal(row.contribution, null);
  assert.ok(result.issues.some((i) => i.code === 'FORM_E_CATEGORY_UNMAPPED' && i.evaluatorType === 'self'));
  assert.equal(result.groups.self.contribution, 10);
});

test('the category mapping can be overridden without code changes', () => {
  const criteria = { ...CRITERIA, self: CRITERIA.self.map((c) => (c.sectionTitle === 'Professional Attitude' && c.id > 450 ? { ...c, sectionKey: 'self-extra', sectionTitle: 'Other duties' } : c)) };
  const result = computeFormE({ evaluations: allGroups(5), criteriaByType: criteria, categoryOverrides: { 'self-extra': 'non_instructional_duties' } });
  const row = result.groups.self.categories.find((c) => c.key === 'non_instructional_duties');
  assert.equal(row.mapped, true);
  assert.ok(row.contribution > 0);
});

test('a stored weight that differs from the official weight is an error', () => {
  const result = computeFormE({ evaluations: allGroups(5), criteriaByType: CRITERIA, formWeights: { student: 50, department_head: 35, peer: 15, self: 10 } });
  assert.ok(result.issues.some((i) => i.code === 'WEIGHT_MISMATCH' && i.severity === 'error'));
  assert.equal(result.isFinal, false);
  assert.equal(result.groups.student.contribution, 40);
});

test('an incomplete submitted evaluation is not counted', () => {
  const broken = { ...evaluation('student', 5, 'approved', 'half'), responses: answerAll('student', 5).slice(0, 10) };
  const result = computeFormE({ evaluations: [broken, ...allGroups(5).slice(1)], criteriaByType: CRITERIA });
  assert.equal(result.groups.student.contribution, null);
  assert.ok(result.issues.some((i) => i.code === 'EVALUATION_NOT_SCORABLE'));
});

test('the same input always gives the same output', () => {
  const run = () => computeFormE({ evaluations: allGroups(3), criteriaByType: CRITERIA });
  assert.deepEqual(run(), run());
});

test('rounding is decimal-safe', () => {
  assert.equal(roundTo(1.005, 2), 1.01);
  assert.equal(roundTo(2.675, 2), 2.68);
  assert.equal(roundTo(0.1 + 0.2, 3), 0.3);
  assert.equal(roundTo(null), null);
});

test('database score rows convert to responses', () => {
  const rows = [{ criterion_id: 7, score: 4, is_na: 0 }, { criterion_id: 8, score: null, is_na: 1 }, { criterion_id: 9, score: 0, is_na: 0 }];
  assert.deepEqual(responsesFromRows(rows), [{ criterionId: 7, score: 4 }, { criterionId: 8, score: 'NA' }, { criterionId: 9, score: 0 }]);
});