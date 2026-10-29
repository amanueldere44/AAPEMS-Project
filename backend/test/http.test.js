import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) return;

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });

    // Ensure idle test connections cannot delay shutdown.
    server.closeAllConnections();
  });
});

test('GET / returns API information', async () => {
  const response = await fetch(`${baseUrl}/`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.name, 'ASEMS API');
});

test('GET /api/health/live reports that the API is alive', async () => {
  const response = await fetch(`${baseUrl}/api/health/live`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.service, 'ASEMS API');
  assert.equal(body.data.status, 'alive');
});

test('GET /api/users rejects unauthenticated requests', async () => {
  const response = await fetch(`${baseUrl}/api/users`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

test('unknown API paths return HTTP 404', async () => {
  const response = await fetch(`${baseUrl}/api/test-path-that-does-not-exist`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.success, false);
});
