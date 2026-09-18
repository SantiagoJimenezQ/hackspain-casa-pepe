import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './index.mjs';

function setup(seed = 42, options = {}) {
  const h = createHarness();
  h.apply('reset', { mode: 'randomized', seed, ...options });
  h.apply('start');
  return h;
}
function migrate(h, companyId = 'alphatech', targetRegionId = 'eu-west-2') {
  return h.apply('migration-start', { companyId, targetRegionId }).migrations.at(-1);
}
function canonical(value) {
  return JSON.parse(JSON.stringify(value, (key, v) => {
    if (['occurredAt', 'updatedAt', 'startedAt', 'resolvedAt', 'completedAt'].includes(key)) return v === null ? null : '<time>';
    if (typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(v)) return '<uuid>';
    return v;
  }));
}

test('same seed/actions replay outcomes despite reads and rejected requests', () => {
  const a = setup(); const b = setup();
  for (let n = 0; n < 30; n++) b.snapshot();
  assert.throws(() => b.apply('reset', { mode: 'randomized', seed: -1 }));
  assert.throws(() => migrate(b, 'missing'));
  migrate(a); migrate(b);
  a.apply('advance', { minutes: 30 });
  for (let n = 0; n < 30; n++) { b.snapshot(); b.apply('advance'); }
  assert.deepEqual(canonical(a.snapshot()), canonical(b.snapshot()));
});

test('different seeds vary capacity/duration without invalid initial allocation', () => {
  const signatures = new Set();
  for (let seed = 0; seed < 30; seed++) {
    const h = setup(seed);
    for (const region of h.snapshot().regions) assert.ok(region.allocated <= region.capacity);
    const m = migrate(h);
    assert.ok(m.durationMinutes >= 12 && m.durationMinutes <= 20);
    signatures.add(JSON.stringify([h.snapshot().regions.map(r => r.capacity), m.durationMinutes]));
  }
  assert.ok(signatures.size > 10);
});

test('pause, step, resume, stop and reset isolate clock and old commands', () => {
  const h = setup(); const oldRun = h.snapshot().runId;
  h.clockTick(); assert.equal(h.snapshot().simulation.elapsedMinutes, 0);
  h.apply('advance', { minutes: 2 }); assert.equal(h.snapshot().simulation.elapsedMinutes, 2);
  h.apply('resume'); h.clockTick(); assert.equal(h.snapshot().simulation.elapsedMinutes, 3);
  h.apply('pause'); h.clockTick(); assert.equal(h.snapshot().simulation.elapsedMinutes, 3);
  const before = h.snapshot();
  assert.throws(() => h.apply('advance', { minutes: 61 }));
  assert.throws(() => h.apply('advance', { expectedRevision: -1 }));
  assert.deepEqual(h.snapshot(), before);
  h.apply('stop'); h.clockTick(); assert.equal(h.snapshot().simulation.elapsedMinutes, 3);
  h.apply('reset', { mode: 'randomized', seed: 99 });
  assert.equal(h.snapshot().simulation.elapsedMinutes, 0);
  assert.throws(() => h.apply('start', { expectedRunId: oldRun }), { code: 'STALE_STATE' });
  assert.equal(h.snapshot().incident, null);
});

test('automatic event budget and concurrent fault cap hold across seeds', () => {
  let faults = 0; let failures = 0; let successes = 0;
  for (let seed = 0; seed < 60; seed++) {
    const h = setup(seed); migrate(h);
    const s = h.apply('advance', { minutes: 60 });
    assert.ok(s.simulation.generatedDisruptions <= 1);
    assert.ok(s.regions.filter(r => r.status !== 'healthy').length <= 2);
    assert.equal(s.migrations.some(m => m.status === 'running'), false);
    assert.ok(s.regions.every(r => r.allocated <= r.capacity));
    faults += s.simulation.generatedDisruptions;
    failures += s.migrations.filter(m => m.status === 'failed').length;
    successes += s.migrations.filter(m => m.status === 'succeeded').length;
    const capped = setup(seed, { maxConcurrentDisruptions: 1 }); migrate(capped);
    capped.apply('advance', { minutes: 60 });
    assert.equal(capped.snapshot().simulation.generatedDisruptions, 0);
  }
  assert.ok(faults > 0 && failures > 0 && successes > 0);
});

test('disabling secondary events still advances migration; recovery stream stays independent', () => {
  const a = setup(42, { automaticEvents: false });
  const b = setup(42, { automaticEvents: true, maxConcurrentDisruptions: 1 });
  assert.equal(migrate(a).durationMinutes, migrate(b).durationMinutes);
  a.apply('advance', { minutes: 60 }); b.apply('advance', { minutes: 60 });
  assert.deepEqual(canonical(a.snapshot().migrations), canonical(b.snapshot().migrations));
  assert.equal(a.snapshot().simulation.generatedDisruptions, 0);
});

test('config validation is atomic and manual mode stays compatible', () => {
  const h = createHarness(); const before = h.snapshot();
  for (const options of [{ seed: null }, { seed: 2 ** 32 }, { difficulty: 'extreme' }, { difficulty: '__proto__' }, { automaticEvents: 'yes' }, { maxConcurrentDisruptions: 0 }, { mode: 'other' }]) {
    assert.throws(() => h.apply('reset', options));
    assert.deepEqual(h.snapshot(), before);
  }
  h.apply('start'); migrate(h);
  h.clockTick(); assert.equal(h.snapshot().migrations[0].progress, 0);
  assert.throws(() => h.apply('advance'));
});
