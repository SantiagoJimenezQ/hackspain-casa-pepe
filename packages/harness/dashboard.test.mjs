import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './index.mjs';
const startMigration = (h, companyId = 'alphatech', targetRegionId = 'eu-west-2') => h.apply('migration-start', { companyId, targetRegionId }).migrations.at(-1).id;

test('dashboard totals derive from company health and population', () => {
  const h = createHarness();
  assert.equal(h.snapshot().summary.totalUsers, 8480);
  const s = h.apply('start');
  assert.equal(s.summary.affectedCompanies, 3);
  assert.equal(s.summary.affectedUsers, 5460);
  assert.equal(s.summary.companiesOnlinePercent, 50);
  assert.equal(s.agent.status, 'awaiting_action');
  h.apply('region', { regionId: 'us-east-1', status: 'degraded' });
  assert.equal(h.snapshot().summary.degraded, 1);
  assert.equal(h.snapshot().summary.affectedUsers, 6440);
});

test('migration reserves capacity and restores company only on completion', () => {
  const h = createHarness(); h.apply('start');
  const id = startMigration(h);
  assert.equal(h.snapshot().regions.find(r => r.id === 'eu-west-2').available, 1);
  h.apply('migration-update', { migrationId: id, progress: 45 });
  assert.equal(h.snapshot().summary.affectedUsers, 5460);
  assert.equal(h.snapshot().summary.migration.progressPercent, 45);
  assert.throws(() => h.apply('migration-update', { migrationId: id, progress: 20 }));
  assert.throws(() => startMigration(h));
  h.apply('migration-update', { migrationId: id, progress: 100 });
  const s = h.snapshot();
  assert.equal(s.summary.affectedUsers, 3120);
  assert.equal(s.companies[0].regionId, 'eu-west-2');
  assert.equal(s.regions.find(r => r.id === 'eu-west-2').allocated, 1);
  assert.throws(() => h.apply('migration-update', { migrationId: id, progress: 100 }));
});

test('capacity limits, destination failure, retries, and invalid requests are coherent', () => {
  const h = createHarness(); h.apply('start');
  h.apply('region', { regionId: 'eu-west-2', capacity: 1 });
  const id = startMigration(h);
  const before = h.snapshot();
  assert.throws(() => startMigration(h, 'globex'));
  assert.throws(() => h.apply('region', { regionId: 'eu-west-2', status: 'unavailable', capacity: 0 }));
  assert.deepEqual(h.snapshot(), before);
  h.apply('region', { regionId: 'eu-west-2', status: 'unavailable' });
  assert.equal(h.snapshot().migrations[0].status, 'failed');
  assert.equal(h.snapshot().regions.find(r => r.id === 'eu-west-2').allocated, 0);
  assert.throws(() => startMigration(h));
  h.apply('region', { regionId: 'eu-west-2', status: 'healthy' });
  const retry = startMigration(h);
  assert.notEqual(id, retry);
  h.apply('migration-update', { migrationId: retry, failureReason: 'Connection timed out' });
  assert.equal(h.snapshot().migrations.at(-1).failureReason, 'Connection timed out');
  h.apply('company-restore', { companyId: 'alphatech' });
  assert.equal(h.snapshot().companies[0].status, 'healthy');
  h.apply('region', { regionId: 'eu-west-2', status: 'unavailable' });
  assert.equal(h.snapshot().companies[0].status, 'unavailable');
});

test('stop cancels work and reset clears dashboard history and placement', () => {
  const h = createHarness(); h.apply('start');
  const id = startMigration(h);
  h.apply('stop');
  assert.equal(h.snapshot().migrations[0].status, 'cancelled');
  assert.equal(h.snapshot().summary.affectedUsers, 0);
  assert.throws(() => h.apply('migration-update', { migrationId: id, progress: 100 }));
  h.apply('reset'); h.apply('start');
  assert.equal(h.snapshot().migrations.length, 0);
  assert.throws(() => h.apply('migration-update', { migrationId: id, progress: 100 }));
});
