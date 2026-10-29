import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFormE, OFFICIAL_WEIGHTS } from './evaluationSummary.js';
import { buildGroupsInput } from './formEInput.js';

// One form version per evaluator type, three criteria in two sections.
const VERSION = { student: 1, department_head: 2, peer: 3, self: 4 };
const criteriaFor = (versionId) => [
  { id: versionId * 10 + 1, sectionKey: 'a', sectionTitle: 'Section A' },
  { id: versionId * 10 + 2, sectionKey: 'a', sectionTitle: 'Section A' },
  { id: versionId * 10 + 3, sectionKey: 'b', sectionTitle: 'Section B' },
];
const criteriaByVersion = new Map(Object.values(VERSION).map((id) => [id, criteriaFor(id)]));
const rowsFor = (evaluationId, versionId, score) => criteriaFor(versionId).map((c) => ({ evaluation_id: evaluationId, criterion_id: c.id, score, is_na: 0 }));
const assignment = (type, evaluationId, status) => ({ form_version_id: VERSION[type], evaluator_type: type, evaluation_id: evaluationId, evaluation_status: status });

function build(assignments, scores) {
  const scoresByEvaluation = new Map();
  for (const [evaluationId, rows] of Object.entries(scores)) scoresByEvaluation.set(Number(evaluationId), rows);
  return buildGroupsInput({ assignments, criteriaByVersion, scoresByEvaluation });
}
const weights = { ...OFFICIAL_WEIGHTS };

test('all four groups submitted gives a complete Form E', () => {
  const groups = build(
    [assignment('student', 1, 'submitted'), assignment('department_head', 2, 'submitted'), assignment('peer', 3, 'submitted'), assignment('self', 4, 'submitted')],
    { 1: rowsFor(1, 1, 5), 2: rowsFor(2, 2, 5), 3: rowsFor(3, 3, 5), 4: rowsFor(4, 4, 5) },
  );
  const form = computeFormE(groups, { weights });
  assert.equal(form.complete, true);
  assert.equal(form.total, 100);
  assert.equal(form.state, 'complete');
});

test('an assignment that was never started keeps the result incomplete', () => {
  const groups = build(
    [assignment('student', 1, 'approved'), assignment('student', null, null), assignment('department_head', 2, 'approved'), assignment('peer', 3, 'approved'), assignment('self', 4, 'approved')],
    { 1: rowsFor(1, 1, 4), 2: rowsFor(2, 2, 4), 3: rowsFor(3, 3, 4), 4: rowsFor(4, 4, 4) },
  );
  const form = computeFormE(groups, { weights });
  assert.deepEqual(form.pendingGroups, [{ type: 'student', assigned: 2, submitted: 1 }]);
  assert.equal(form.total, null);
});

test('draft, returned and rejected evaluations are passed on unscored and not counted', () => {
  const groups = build(
    [assignment('student', 1, 'draft'), assignment('department_head', 2, 'rejected'), assignment('peer', 3, 'returned'), assignment('self', 4, 'approved')],
    { 4: rowsFor(4, 4, 4) },
  );
  assert.deepEqual(groups.student.evaluations, [{ id: 1, status: 'draft' }]);
  const form = computeFormE(groups, { weights });
  assert.deepEqual(form.missingGroups, ['student', 'department_head', 'peer']);
  assert.deepEqual(form.excluded.map((item) => item.status).sort(), ['draft', 'rejected', 'returned']);
  assert.equal(form.partialTotal, 8);
});

test('a submitted evaluation with a missing answer is reported as an issue, not scored', () => {
  const groups = build(
    [assignment('student', 1, 'submitted'), assignment('department_head', 2, 'submitted'), assignment('peer', 3, 'submitted'), assignment('self', 4, 'submitted')],
    { 1: rowsFor(1, 1, 5).slice(1), 2: rowsFor(2, 2, 5), 3: rowsFor(3, 3, 5), 4: rowsFor(4, 4, 5) },
  );
  const form = computeFormE(groups, { weights });
  assert.equal(form.complete, false);
  assert.ok(form.issues.some((issue) => issue.code === 'INVALID_EVALUATION'));
});

test('approved only when every counted evaluation is approved', () => {
  const approved = build(
    [assignment('student', 1, 'approved'), assignment('department_head', 2, 'approved'), assignment('peer', 3, 'approved'), assignment('self', 4, 'approved')],
    { 1: rowsFor(1, 1, 3), 2: rowsFor(2, 2, 3), 3: rowsFor(3, 3, 3), 4: rowsFor(4, 4, 3) },
  );
  assert.equal(computeFormE(approved, { weights }).state, 'approved');
  const mixed = build(
    [assignment('student', 1, 'approved'), assignment('department_head', 2, 'submitted'), assignment('peer', 3, 'approved'), assignment('self', 4, 'approved')],
    { 1: rowsFor(1, 1, 3), 2: rowsFor(2, 2, 3), 3: rowsFor(3, 3, 3), 4: rowsFor(4, 4, 3) },
  );
  assert.equal(computeFormE(mixed, { weights }).state, 'complete');
});