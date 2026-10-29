import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_WEIGHTS, EVALUATOR_TYPES, roundTo, scoreValueProblem, validateWeights,
  validateResponses, scoreEvaluation, aggregateGroup, computeFormE, responseFromDbRow,
} from './evaluationSummary.js';

// Official section layouts (key, title, number of criteria).
const LAYOUT = {
  student: [['instructional', 'Instructional Skills', 15], ['ethics', 'Professional Ethics and Attitude Towards Students', 8], ['assessment', 'Assessment Methods & Feedback', 7]],
  department_head: [['core', 'Core Competency', 11], ['professional', 'Professional Competency', 7], ['time', 'Time Management', 4], ['ethical', 'Ethical Competence', 5]],
  peer: [['subject', 'Subject Matter Competency', 4], ['research', 'Research and Community Services', 5], ['professional', 'Professional Competency', 7], ['ethical', 'Ethical Competence', 8], ['time', 'Time Management', 2]],
  self: [['instructional', 'Instructional Skills', 15], ['ethics', 'Professional Ethics and Attitude Towards Students', 8], ['assessment', 'Assessment Methods & Feedback', 9], ['behavior', 'Overall Personal Behavior', 9], ['attitude', 'Professional Attitude', 8], ['noninstructional', 'Performing Non-instructional Duties', 6], ['interpersonal', 'Interpersonal Relationship Capability', 7]],
};

function makeCriteria(type, firstId = 1) {
  let id = firstId;
  return LAYOUT[type].flatMap(([sectionKey, sectionTitle, count]) =>
    Array.from({ length: count }, () => ({ id: id++, sectionKey, sectionTitle })));
}  
const answers = (criteria, scoreOf) =>
  criteria.map((criterion, index) => ({ criterionId: criterion.id, score: typeof scoreOf === 'function' ? scoreOf(criterion, index) : scoreOf }));
const scored = (type, scoreOf, extra = {}) => {
  const criteria = makeCriteria(type);
  return { ...scoreEvaluation(answers(criteria, scoreOf), criteria), ...extra };
};
const allGroups = (scoreOf, extra = {}) =>
  Object.fromEntries(EVALUATOR_TYPES.map((type) => [type, { evaluations: [scored(type, scoreOf, { id: type, ...extra })] }]));

// Real score sets copied from the ambo_performance_evaluation dump (cycle 12, instructor 7).
const REAL = {
  student: [0, 1, 2, 3, 2, 2, 2, 2, 2, 1, 5, 5, 5, 5, 5, 3, 4, 4, 3, 3, 3, 3, 2, 1, 2, 2, 3, 3, 2, 3],
  department_head: [3, 4, 4, 4, 3, 2, 2, 2, 3, 4, 3, 2, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 2, 3, 3, 3],
  peer: [5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 2, 2, 2, 3, 3, 2, 3, 3, 2, 2, 2],
  self: [0, 5, 5, 5, 5, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 3, 2, 2, 2, 2, 2, 3, 4, 3, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 2, 3, 2, 3, 2, 3, 4, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 3, 3, 3, 5, 5, 5, 4, 4, 4, 4],
};

test('official weights are 40/35/15/10 and add up to 100', () => {
  assert.deepEqual({ ...OFFICIAL_WEIGHTS }, { student: 40, department_head: 35, peer: 15, self: 10 });
  assert.equal(Object.values(OFFICIAL_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.equal(validateWeights().valid, true);
});

test('weights that do not add up to 100 or are missing are rejected', () => {
  assert.equal(validateWeights({ ...OFFICIAL_WEIGHTS, self: 20 }).issues[0].code, 'WEIGHT_SUM');
  assert.equal(validateWeights({ student: 40, department_head: 35, peer: 15 }).issues[0].code, 'WEIGHT_MISSING');
  assert.equal(validateWeights({ ...OFFICIAL_WEIGHTS, student: 140, self: -90 }).issues[0].code, 'WEIGHT_RANGE');
});

test('criteria counts match the official forms (30, 27, 26 and 62 in the DB layout)', () => {
  assert.equal(makeCriteria('student').length, 30);
  assert.equal(makeCriteria('department_head').length, 27);
  assert.equal(makeCriteria('peer').length, 26);
  assert.equal(makeCriteria('self').length, 62);
});

test('valid ratings are 0-5 and NA; everything else is rejected', () => {
  for (const ok of [0, 1, 2, 3, 4, 5, 'NA']) assert.equal(scoreValueProblem(ok), null);
  for (const bad of [6, -1, 2.5, '3', 'na', 'N/A', null, undefined, NaN, true, {}, []]) {
    assert.ok(scoreValueProblem(bad), `expected ${String(bad)} to be rejected`);
  }
  assert.ok(scoreValueProblem('NA', { allowNa: false }));
});

test('zero is a real score and is not treated as missing or NA', () => {
  const result = scored('student', 0);
  assert.equal(result.ok, true);
  assert.equal(result.overall.average, 0);
  assert.equal(result.overall.counted, 30);
  assert.equal(result.overall.naCount, 0);
  assert.equal(responseFromDbRow({ criterion_id: 4, score: 0, is_na: 0 }).score, 0);
  assert.equal(responseFromDbRow({ criterion_id: 4, score: null, is_na: 1 }).score, 'NA');
});

test('duplicate, unknown, missing and invalid responses are reported', () => {
  const criteria = makeCriteria('student');
  const good = answers(criteria, 4);
  const codes = (responses) => validateResponses(responses, criteria).issues.map((issue) => issue.code);
  assert.deepEqual(codes(good), []);
  assert.ok(codes([...good, { criterionId: 1, score: 5 }]).includes('DUPLICATE_CRITERION'));
  assert.ok(codes([...good, { criterionId: 999, score: 5 }]).includes('UNKNOWN_CRITERION'));
  assert.ok(codes(good.slice(1)).includes('MISSING_RESPONSE'));
  assert.ok(codes([{ criterionId: 1, score: 9 }, ...good.slice(1)]).includes('INVALID_SCORE'));
  assert.ok(codes([{ score: 3 }, ...good]).includes('MALFORMED'));
  assert.equal(scoreEvaluation(good.slice(1), criteria).ok, false);
});

test('NA policy: excluded from the denominator by default, counted as zero when configured', () => {
  const criteria = makeCriteria('student');
  const responses = answers(criteria, (_c, index) => (index === 0 ? 'NA' : 5));
  const excluded = scoreEvaluation(responses, criteria);
  assert.equal(excluded.overall.counted, 29);
  assert.equal(excluded.overall.naCount, 1);
  assert.equal(excluded.overall.average, 5);
  const asZero = scoreEvaluation(responses, criteria, { naPolicy: 'zero' });
  assert.equal(asZero.overall.counted, 30);
  assert.equal(roundTo(asZero.overall.average, 4), roundTo(145 / 30, 4));
});

test('an evaluation where every criterion is NA cannot be scored', () => {
  const result = scored('student', 'NA');
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, 'NO_SCORED_CRITERIA');
});

test('every group contributes its own weight at most: all fives give exactly 100', () => {
  const form = computeFormE(allGroups(5));
  assert.equal(form.total, 100);
  for (const type of EVALUATOR_TYPES) {
    assert.equal(form.groups[type].contribution, OFFICIAL_WEIGHTS[type]);
    assert.ok(form.groups[type].contribution <= form.groups[type].maxContribution);
  }
});

test('all zeros give a real total of 0, which is different from missing', () => {
  const zeros = computeFormE(allGroups(0));
  assert.equal(zeros.total, 0);
  assert.equal(zeros.complete, true);
  const missing = computeFormE({});
  assert.equal(missing.total, null);
  assert.equal(missing.groups.student.contribution, null);
  assert.equal(missing.groups.student.average, null);
});

test('regression with real data: contributions come from exact averages, not rounded ones', () => {
  const groups = Object.fromEntries(EVALUATOR_TYPES.map((type) => {
    const criteria = makeCriteria(type);
    return [type, { evaluations: [{ id: type, ...scoreEvaluation(answers(criteria, (_c, i) => REAL[type][i]), criteria) }] }];
  }));
  const form = computeFormE(groups);
  assert.equal(form.groups.student.average, 2.767);
  assert.equal(form.groups.student.contribution, 22.133); // stored summary row shows 22.136
  assert.equal(form.groups.department_head.contribution, 20.481);
  assert.equal(form.groups.peer.contribution, 10.269);
  assert.equal(form.groups.self.contribution, 6.71);
  assert.equal(form.total, 59.593); // stored summary row shows 59.597
});

test('category contributions add up exactly to the group contribution', () => {
  for (const type of EVALUATOR_TYPES) {
    const criteria = makeCriteria(type);
    const evaluation = { id: 1, ...scoreEvaluation(answers(criteria, (_c, i) => REAL[type][i]), criteria) };
    const group = aggregateGroup(type, [evaluation], OFFICIAL_WEIGHTS[type]);
    const sum = roundTo(group.categories.reduce((total, category) => total + category.contribution, 0));
    assert.equal(sum, group.contribution, `${type} categories must reconcile`);
  }
});

test('category contributions reconcile with several students and with NA answers', () => {
  const criteria = makeCriteria('student');
  const make = (id, fn) => ({ id, ...scoreEvaluation(answers(criteria, fn), criteria) });
  const evaluations = [
    make(1, (_c, i) => REAL.student[i]),
    make(2, (_c, i) => (i % 7 === 0 ? 'NA' : (i % 6))),
    make(3, () => 5),
  ];
  const group = aggregateGroup('student', evaluations, 40);
  assert.equal(group.evaluatorCount, 3);
  assert.equal(roundTo(group.categories.reduce((t, c) => t + c.contribution, 0)), group.contribution);
  assert.ok(group.contribution <= 40);
});

test('several evaluators in a group count equally', () => {
  const criteria = makeCriteria('student');
  const make = (id, score) => ({ id, ...scoreEvaluation(answers(criteria, score), criteria) });
  const group = aggregateGroup('student', [make(1, 5), make(2, 3)], 40);
  assert.equal(group.average, 4);
  assert.equal(group.contribution, 32);
});

test('a missing group is never converted to zero and blocks the total', () => {
  const groups = allGroups(4);
  delete groups.peer;
  const form = computeFormE(groups);
  assert.equal(form.total, null);
  assert.equal(form.partialTotal, 32 + 28 + 8); // all 4s: students 32, head 28, self 8
  assert.deepEqual(form.missingGroups, ['peer']);
  assert.equal(form.groups.peer.contribution, null);
  assert.equal(form.complete, false);
  assert.equal(form.eligibleForFinalApproval, false);
  assert.equal(form.state, 'incomplete');
});

test('assigned evaluators who have not submitted keep the result incomplete', () => {
  const groups = allGroups(4);
  groups.student.assignedCount = 3;
  const form = computeFormE(groups);
  assert.deepEqual(form.pendingGroups, [{ type: 'student', assigned: 3, submitted: 1 }]);
  assert.equal(form.total, null);
  assert.equal(form.eligibleForFinalApproval, false);
  groups.student.assignedCount = 1;
  assert.equal(computeFormE(groups).complete, true);
});

test('draft, returned and rejected evaluations are not counted and are listed', () => {
  const groups = allGroups(4);
  groups.peer.evaluations[0].status = 'rejected';
  groups.self.evaluations[0].status = 'returned';
  const form = computeFormE(groups);
  assert.deepEqual(form.missingGroups.sort(), ['peer', 'self']);
  assert.deepEqual(form.excluded.map((item) => item.status).sort(), ['rejected', 'returned']);
  assert.equal(form.total, null);
});

test('state is complete when submitted and approved only when every evaluation is approved', () => {
  assert.equal(computeFormE(allGroups(4, { status: 'submitted' })).state, 'complete');
  assert.equal(computeFormE(allGroups(4, { status: 'approved' })).state, 'approved');
  const mixed = allGroups(4, { status: 'approved' });
  mixed.student.evaluations[0].status = 'submitted';
  assert.equal(computeFormE(mixed).state, 'complete');
});

test('an invalid evaluation blocks completion and a duplicate is not counted twice', () => {
  const criteria = makeCriteria('student');
  const broken = { id: 9, ...scoreEvaluation(answers(criteria, 4).slice(1), criteria) };
  const groups = allGroups(4);
  groups.student.evaluations.push(broken);
  const form = computeFormE(groups);
  assert.equal(form.complete, false);
  assert.equal(form.issues[0].code, 'INVALID_EVALUATION');

  const duplicated = allGroups(4);
  duplicated.peer.evaluations.push({ ...duplicated.peer.evaluations[0] });
  const result = computeFormE(duplicated);
  assert.equal(result.groups.peer.evaluatorCount, 1);
  assert.equal(result.issues[0].code, 'DUPLICATE_EVALUATION');
});

test('the unconfirmed self-evaluation category and the NA policy are flagged as notices', () => {
  const notices = computeFormE(allGroups(4)).notices.map((notice) => notice.code);
  assert.ok(notices.includes('UNCONFIRMED_NA_POLICY'));
  assert.ok(notices.includes('UNCONFIRMED_CATEGORY_MAPPING'));
});

test('invalid weights stop the calculation instead of producing a number', () => {
  const form = computeFormE(allGroups(4), { weights: { ...OFFICIAL_WEIGHTS, self: 11 } });
  assert.equal(form.valid, false);
  assert.equal(form.total, null);
});

test('the same input always gives the same output', () => {
  const run = () => JSON.stringify(computeFormE(allGroups((_c, i) => i % 6)));
  assert.equal(run(), run());
});

test('rounding is controlled and free of floating-point noise', () => {
  assert.equal(roundTo(1.0005), 1.001);
  assert.equal(roundTo(0.1 + 0.2), 0.3);
  assert.equal(roundTo(22.13333333), 22.133);
  assert.equal(roundTo(null), null);
  assert.equal(roundTo(Infinity), null);
});