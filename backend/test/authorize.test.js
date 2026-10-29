import test from 'node:test';
import assert from 'node:assert/strict';

import { authorize } from '../src/middlewares/authorize.js';

function createResponse() {
  return {
    statusCode: null,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('rejects requests without an authenticated user', () => {
  const middleware = authorize('admin');
  const req = {};
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'AUTHENTICATION_REQUIRED');
  assert.equal(nextCalled, false);
});

test('rejects authenticated users with the wrong role', () => {
  const middleware = authorize('admin');
  const req = { user: { id: 10, role: 'teacher' } };
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
  assert.equal(nextCalled, false);
});

test('allows an authenticated administrator', () => {
  const middleware = authorize('admin');
  const req = { user: { id: 1, role: 'admin' } };
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('allows any one of the explicitly permitted roles', () => {
  const middleware = authorize('admin', 'department_head');
  const req = { user: { id: 12, role: 'department_head' } };
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test('rejects invalid role names when configuring middleware', () => {
  assert.throws(
    () => authorize('superuser'),
    /Invalid authorization role/,
  );
});

test('requires at least one permitted role', () => {
  assert.throws(
    () => authorize(),
    /at least one allowed role/,
  );
});
