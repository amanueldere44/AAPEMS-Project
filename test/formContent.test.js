import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRatingScale,
  draftContentSchema,
  findContentProblems,
  scoreProblem,
} from '../src/utils/formContent.js';

const version = { scale_min: 0, scale_max: 5, allow_na: 1 };

test('rating scale matches the official forms: 5 to 0 and NA', () => {
  assert.deepEqual(buildRatingScale({ scaleMin: 0, scaleMax: 5, allowNa: true }), [5, 4, 3, 2, 1, 0, 'NA']);
  assert.deepEqual(buildRatingScale({ scaleMin: 0, scaleMax: 5, allowNa: false }), [5, 4, 3, 2, 1, 0]);
});

test('scores outside the version scale are rejected', () => {
  assert.equal(scoreProblem(0, version), null);
  assert.equal(scoreProblem(5, version), null);
  assert.match(scoreProblem(6, version), /between 0 and 5/);
  assert.equal(scoreProblem('NA', version), null);
  assert.match(scoreProblem('NA', { ...version, allow_na: 0 }), /NA is not permitted/);
});

test('draft content needs at least one section and one criterion per section', () => {
  assert.equal(draftContentSchema.safeParse({ sections: [] }).success, false);
  assert.equal(
    draftContentSchema.safeParse({ sections: [{ sectionKey: 'a', title: 'A', criteria: [] }] }).success,
    false,
  );
  assert.equal(
    draftContentSchema.safeParse({ sections: [{ sectionKey: 'a', title: 'A', criteria: [{ text: 'x' }] }] }).success,
    true,
  );
});

test('section keys must be simple and unique', () => {
  assert.equal(
    draftContentSchema.safeParse({ sections: [{ sectionKey: 'a b', title: 'A', criteria: [{ text: 'x' }] }] }).success,
    false,
  );
  const section = { sectionKey: 'A-1', title: 'A', criteria: [{ text: 'x' }] };
  assert.equal(findContentProblems([section]).length, 0);
  assert.equal(findContentProblems([section, { ...section, sectionKey: 'a-1' }]).length, 1);
});