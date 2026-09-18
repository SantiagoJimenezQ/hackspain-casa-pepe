// Runnable integration example. Intentionally resets the local demo server.
const base = process.env.API_BASE_URL || 'http://127.0.0.1:4000';
let snapshot;
async function post(path, body = {}) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, ...(snapshot ? { expectedRunId: snapshot.runId, expectedRevision: snapshot.revision } : {}) }),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${result.error.code}: ${result.error.message}`);
  snapshot = result;
  return result;
}
await post('/api/simulation/reset', { mode: 'randomized', seed: 42, difficulty: 'medium', automaticEvents: true });
await post('/api/incident/start');
await post('/api/migrations/start', { companyId: 'alphatech', targetRegionId: 'eu-west-2' });
// The client chose this action; the harness never chooses an agent recovery plan.
for (let minute = 0; minute < 30 && snapshot.migrations.some(m => m.status === 'running'); minute++) {
  await post('/api/simulation/advance', { minutes: 1 });
  const migration = snapshot.migrations.at(-1);
  console.log(JSON.stringify({ minute: snapshot.simulation.elapsedMinutes, status: migration.status,
    progress: migration.progress, reason: migration.failureReason, affectedUsers: snapshot.summary.affectedUsers }));
}
console.log('Simulation is paused. Inspect GET /api/status and choose the next recovery action.');
