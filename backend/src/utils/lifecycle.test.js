import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveLifecycle } from './lifecycle.js';

const approvedAll = ['student', 'department_head', 'peer', 'self'].map((type) => ({ type, assigned: 2, submitted: 2, approved: 2 }));
const ALL_COPIES = ['teacher', 'department', 'college'];
const ALL_LEVELS = ['department', 'college_school_institute', 'university'];
const state = (result, key) => result.stages.find((s) => s.key === key).state;

test('nothing assigned: every later stage is blocked', () => {
  const r = deriveLifecycle({ summary: { id: 1, status: 'incomplete' } });
  assert.equal(state(r, 'evaluations'), 'not_started');
  assert.equal(state(r, 'final_summary'), 'blocked');
  assert.equal(r.endReached, false);
});

test('a missing evaluator group keeps the evaluation stage open even if the others are approved', () => {
  const r = deriveLifecycle({ summary: { id: 1, status: 'incomplete' }, evaluators: approvedAll.filter((g) => g.type !== 'peer') });
  assert.equal(state(r, 'evaluations'), 'in_progress');
});

test('approved evaluations make Form E ready, then finalized', () => {
  assert.equal(state(deriveLifecycle({ summary: { id: 1, status: 'complete' }, evaluators: approvedAll }), 'final_summary'), 'ready');
  assert.equal(state(deriveLifecycle({ summary: { id: 1, status: 'reviewed' }, evaluators: approvedAll }), 'final_summary'), 'done');
});

test('archive stays blocked until forwarded, and needs all three levels', () => {
  const base = { summary: { id: 1, status: 'reviewed' }, evaluators: approvedAll, copies: ALL_COPIES };
  assert.equal(state(deriveLifecycle(base), 'forwarded'), 'ready');
  assert.equal(state(deriveLifecycle(base), 'archive'), 'blocked');
  const fwd = { ...base, routing: { forwardedAt: '2026-10-25' } };
  assert.equal(state(deriveLifecycle({ ...fwd, levels: ['department'] }), 'archive'), 'in_progress');
  assert.equal(state(deriveLifecycle({ ...fwd, levels: ALL_LEVELS }), 'archive'), 'done');
});

test('end is reached when the report branch is done and no referral was made', () => {
  const r = deriveLifecycle({
    summary: { id: 1, status: 'archived' }, evaluators: approvedAll, copies: ALL_COPIES,
    routing: { forwardedAt: 'x' }, levels: ALL_LEVELS,
  });
  assert.equal(r.endReached, true);
  assert.equal(r.endReachedIsDerived, true);
});

test('an open referral keeps the end from being reached', () => {
  const done = {
    summary: { id: 1, status: 'archived' }, evaluators: approvedAll, copies: ALL_COPIES,
    routing: { forwardedAt: 'x' }, levels: ALL_LEVELS,
  };
  const open = deriveLifecycle({ ...done, referrals: [{ acknowledged: true, activityCount: 2, completedCount: 1 }] });
  assert.equal(open.endReached, false);
  assert.equal(state(open, 'improvement'), 'in_progress');
  const worked = deriveLifecycle({ ...done, referrals: [{ acknowledged: true, activityCount: 2, completedCount: 2 }] });
  assert.equal(worked.endReached, true);
});

test('an unacknowledged referral or one with no activity is not worked through', () => {
  const done = {
    summary: { id: 1, status: 'archived' }, evaluators: approvedAll, copies: ALL_COPIES,
    routing: { forwardedAt: 'x' }, levels: ALL_LEVELS,
  };
  assert.equal(deriveLifecycle({ ...done, referrals: [{ acknowledged: false, activityCount: 0, completedCount: 0 }] }).endReached, false);
  assert.equal(deriveLifecycle({ ...done, referrals: [{ acknowledged: true, activityCount: 0, completedCount: 0 }] }).endReached, false);
});