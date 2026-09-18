import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './index.mjs';
import { createHarness } from '../../packages/harness/index.mjs';

test('incident lifecycle, capacity twist, partial recovery, and clean reset', () => {
  const harness = createHarness();
  const initial = harness.snapshot();
  assert.equal(initial.status, 'healthy');
  const started = harness.apply('start');
  assert.equal(started.status, 'unavailable');
  assert.deepEqual(harness.apply('start'), started);
  assert.equal(harness.apply('capacity', { capacity: 1 }).backup.capacity, 1);
  assert.equal(harness.apply('service', { serviceId: 'route-assignment', status: 'healthy' }).status, 'degraded');
  assert.throws(() => harness.apply('capacity', { capacity: -1 }));
  const stopped = harness.apply('stop');
  assert.equal(stopped.status, 'healthy');
  assert.equal(stopped.incident.status, 'resolved');
  assert.ok(stopped.events.length > started.events.length);
  assert.deepEqual(harness.apply('stop'), stopped);
  const reset = harness.apply('reset');
  assert.notEqual(reset.runId, initial.runId);
  assert.equal(reset.backup.capacity, 2);
  assert.equal(reset.events.length, 1);
  assert.equal(reset.incident, null);
});

test('HTTP status, controls, and validation', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await (await fetch(`${base}/api/status`)).json()).simulated, true);
  const start = await fetch(`${base}/api/incident/start`, { method: 'POST' });
  assert.equal((await start.json()).status, 'unavailable');
  assert.equal((await fetch(`${base}/api/simulation/capacity`, { method: 'POST', body: '{"capacity":9}' })).status, 400);
  assert.equal((await fetch(`${base}/api/incident/start`, { method: 'POST', body: '{' })).status, 400);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
});

test('dashboard API supports recovery and rejects malformed controls', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await post('/api/incident/start');
  const started = await post('/api/migrations/start', { companyId: 'alphatech', targetRegionId: 'eu-west-2' });
  assert.equal(started.status, 200);
  const id = (await started.json()).migrations[0].id;
  const updated = await post('/api/migrations/update', { migrationId: id, progress: 100 });
  assert.equal((await updated.json()).summary.affectedCompanies, 2);
  const failedRegion = await post('/api/simulation/region', { regionId: 'eu-west-2', status: 'unavailable' });
  assert.equal((await failedRegion.json()).summary.affectedCompanies, 3);
  const restored = await post('/api/simulation/company/restore', { companyId: 'alphatech' });
  assert.equal((await restored.json()).companies[0].status, 'healthy');
  assert.equal((await post('/api/migrations/start', { companyId: 'unknown' })).status, 400);
  assert.equal((await post('/api/simulation/region', { regionId: 'eu-west-2', status: 'broken' })).status, 400);
});

test('randomized HTTP controls, stale guards, live clock and published schema', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const status = async () => (await fetch(`${base}/api/status`)).json();
  const spec = await (await fetch(`${base}/api/openapi.json`)).json();
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.paths['/api/simulation/advance']);
  const run = await (await post('/api/simulation/reset', { mode: 'randomized', seed: 42 })).json();
  assert.equal(run.simulation.paused, true);
  assert.equal((await post('/api/incident/start', { expectedRunId: run.runId, expectedRevision: run.revision })).status, 200);
  const stale = await post('/api/simulation/advance', { expectedRevision: run.revision });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'STALE_STATE');
  const step = await (await post('/api/simulation/advance', { minutes: 3 })).json();
  assert.equal(step.simulation.elapsedMinutes, 3);
  await post('/api/simulation/resume');
  // Allow two callbacks; test the real server clock wiring, not only the harness.
  await new Promise(resolve => setTimeout(resolve, 2100));
  const paused = await (await post('/api/simulation/pause')).json();
  assert.ok(paused.simulation.elapsedMinutes > 3);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await status()).simulation.elapsedMinutes, paused.simulation.elapsedMinutes);
  assert.equal((await post('/api/simulation/advance', { minutes: 0 })).status, 400);
  const huge = await post('/api/simulation/reset', { ignored: 'x'.repeat(9000) });
  assert.equal(huge.status, 413);
});

test('published runnable client completes against HTTP server', async t => {
  const { spawn } = await import('node:child_process');
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const child = spawn(process.execPath, ['apps/server/demo-client.mjs'], {
    env: { ...process.env, API_BASE_URL: `http://127.0.0.1:${server.address().port}` },
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0, output);
  assert.match(output, /Simulation is paused/);
});
