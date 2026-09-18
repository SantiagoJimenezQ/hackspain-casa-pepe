const healthStates = ['healthy', 'degraded', 'unavailable'];
export function createDashboard() {
  const regions = [
    ['eu-west-1', 'Europe · Ireland', 53.35, -6.26, 'primary', 6],
    ['eu-west-2', 'Europe · London', 51.51, -0.13, 'backup', 2],
    ['us-east-1', 'North America · Virginia', 38.13, -78.45, 'backup', 3],
    ['ap-southeast-1', 'Asia · Singapore', 1.35, 103.82, 'backup', 2],
    ['sa-east-1', 'South America · São Paulo', -23.55, -46.63, 'backup', 2],
  ].map(([id, name, latitude, longitude, role, capacity]) => ({ id, name, latitude, longitude, role, capacity, status: 'healthy' }));
  const companies = [
    ['alphatech', 'Alphatech', 2340, 'eu-west-1', 1, 'Critical route dispatch operations'],
    ['globex', 'Globex', 1890, 'eu-west-1', 2, 'Time-sensitive delivery coordination'],
    ['initech', 'Initech', 1230, 'eu-west-1', 3, 'Package tracking can tolerate a short delay'],
    ['umbrella', 'Umbrella', 980, 'us-east-1', 4, 'Regional operations currently available'],
    ['soylent', 'Soylent', 1120, 'ap-southeast-1', 5, 'Regional operations currently available'],
    ['stark-industries', 'Stark Industries', 920, 'sa-east-1', 6, 'Regional operations currently available'],
  ].map(([id, name, users, regionId, priority, priorityReason]) => ({ id, name, users, regionId, homeRegionId: regionId, priority, priorityReason }));
  return { regions, companies, migrations: [] };
}
export function allocated(state, regionId) {
  return state.companies.filter(c => c.regionId === regionId).length
    + state.migrations.filter(m => m.targetRegionId === regionId && m.status === 'running').length;
}
function finish(migration, status, reason = null) {
  migration.status = status;
  migration.failureReason = reason;
  migration.completedAt = new Date().toISOString();
  migration.etaMinutes = null;
}
export function cancelMigrations(state) {
  state.migrations.filter(m => m.status === 'running').forEach(m => finish(m, 'cancelled'));
}
export function companyHealth(state, company) {
  const region = state.regions.find(r => r.id === company.regionId);
  if (region.status === 'unavailable') return 'unavailable';
  if (company.regionId !== state.region) return region.status;
  const statuses = state.services.map(s => s.status);
  if (statuses.every(s => s === 'unavailable')) return 'unavailable';
  return region.status === 'degraded' || statuses.some(s => s !== 'healthy') ? 'degraded' : 'healthy';
}
export function dashboardSnapshot(state) {
  const companies = state.companies.map(c => ({ ...c, status: companyHealth(state, c),
    migrationId: state.migrations.findLast(m => m.companyId === c.id)?.id ?? null }));
  const count = status => companies.filter(c => c.status === status).length;
  const migrations = state.migrations;
  const active = migrations.filter(m => m.status === 'running');
  const affected = companies.filter(c => c.status !== 'healthy');
  const latest = companies.map(c => migrations.findLast(m => m.companyId === c.id)).filter(Boolean);
  return {
    regions: state.regions.map(r => ({ ...r, allocated: allocated(state, r.id), available: r.status === 'healthy' ? Math.max(0, r.capacity - allocated(state, r.id)) : 0 })),
    companies, migrations,
    summary: { totalCompanies: companies.length, totalUsers: companies.reduce((n, c) => n + c.users, 0),
      affectedCompanies: affected.length, affectedUsers: affected.reduce((n, c) => n + c.users, 0),
      online: count('healthy'), degraded: count('degraded'), offline: count('unavailable'),
      companiesOnlinePercent: Math.round(count('healthy') / companies.length * 100),
      migration: { total: migrations.length, running: active.length,
        succeeded: migrations.filter(m => m.status === 'succeeded').length,
        failed: migrations.filter(m => m.status === 'failed').length,
        cancelled: migrations.filter(m => m.status === 'cancelled').length,
        progressPercent: latest.length ? Math.round(latest.reduce((n, m) => n + m.progress, 0) / latest.length) : 0 } },
    agent: { simulated: true, status: state.incident?.status !== 'active' ? 'idle' : active.length ? 'recovering' : affected.length ? 'awaiting_action' : 'monitoring',
      currentAction: active.length ? 'Operator-controlled simulated migrations in progress' : affected.length ? 'Waiting for an operator recovery action' : 'Monitoring simulated infrastructure',
      lastEventId: state.events.at(-1)?.id ?? null },
  };
}
export function applyDashboard(state, command, body, record, makeId, progressReason = 'Operator updated simulated progress') {
  if (state.incident?.status !== 'active') throw new Error('Start an incident before changing dashboard state');
  if (command === 'region') {
    const region = state.regions.find(r => r.id === body.regionId);
    if (!region) throw new Error('Unknown regionId');
    if (body.status === undefined && body.capacity === undefined) throw new Error('Provide status or capacity');
    if (body.status !== undefined && !healthStates.includes(body.status)) throw new Error('Invalid region health');
    if (body.capacity !== undefined && (!Number.isInteger(body.capacity) || body.capacity < allocated(state, region.id) || body.capacity > 100)) {
      throw new Error('capacity must be an integer between allocated slots and 100');
    }
    if (body.capacity !== undefined) region.capacity = body.capacity;
    if (body.status !== undefined) region.status = body.status;
    record('region.changed', { regionId: region.id, status: region.status, capacity: region.capacity });
    if (region.status !== 'healthy') {
      for (const migration of state.migrations.filter(m => m.targetRegionId === region.id && m.status === 'running')) {
        finish(migration, 'failed', 'Destination region is no longer healthy');
        record('migration.failed', { migrationId: migration.id, reason: migration.failureReason });
      }
    }
  } else if (command === 'migration-start') {
    const company = state.companies.find(c => c.id === body.companyId);
    const target = state.regions.find(r => r.id === body.targetRegionId);
    if (!company || !target) throw new Error('Unknown companyId or targetRegionId');
    if (target.id === company.regionId || target.status !== 'healthy') throw new Error('Choose a different, healthy destination');
    if (allocated(state, target.id) >= target.capacity) throw new Error('Destination has no available capacity');
    if (state.migrations.some(m => m.companyId === company.id && m.status === 'running')) throw new Error('Company already has a running migration');
    const migration = { id: makeId(), companyId: company.id, sourceRegionId: company.regionId, targetRegionId: target.id,
      status: 'running', progress: 0, durationMinutes: 20, etaMinutes: 20, failureReason: null, startedAt: new Date().toISOString(), completedAt: null };
    state.migrations.push(migration);
    record('migration.started', { migrationId: migration.id, companyId: company.id, targetRegionId: target.id });
  } else if (command === 'migration-update') {
    const migration = state.migrations.find(m => m.id === body.migrationId);
    if (!migration || migration.status !== 'running') throw new Error('Choose a running migration');
    if (body.failureReason !== undefined) {
      if (typeof body.failureReason !== 'string' || !body.failureReason.trim() || body.failureReason.length > 500 || body.progress !== undefined) throw new Error('Provide a failureReason of 1–500 characters, without progress');
      finish(migration, 'failed', body.failureReason.trim());
    } else {
      if (!Number.isInteger(body.progress) || body.progress < migration.progress || body.progress > 100) throw new Error('progress must be an integer from current progress to 100');
      migration.progress = body.progress;
      migration.etaMinutes = Math.ceil((100 - body.progress) * migration.durationMinutes / 100);
      if (migration.workMinutes !== undefined) migration.workMinutes = Math.max(migration.workMinutes, body.progress * migration.durationMinutes / 100);
      if (body.progress === 100) {
        state.companies.find(c => c.id === migration.companyId).regionId = migration.targetRegionId;
        finish(migration, 'succeeded');
      }
    }
    record(`migration.${migration.status}`, { migrationId: migration.id, progress: migration.progress, reason: migration.failureReason ?? progressReason });
  } else if (command === 'company-restore') {
    const company = state.companies.find(c => c.id === body.companyId);
    if (!company) throw new Error('Unknown companyId');
    if (state.migrations.some(m => m.companyId === company.id && m.status === 'running')) throw new Error('Complete or fail the running migration first');
    if (companyHealth(state, company) === 'healthy') return;
    // Explicit operator override is represented as a completed migration, consuming a real slot.
    const target = state.regions.find(r => r.id !== company.regionId && r.status === 'healthy' && allocated(state, r.id) < r.capacity && r.id !== state.region);
    if (!target) throw new Error('No healthy backup capacity available');
    applyDashboard(state, 'migration-start', { companyId: company.id, targetRegionId: target.id }, record, makeId);
    applyDashboard(state, 'migration-update', { migrationId: state.migrations.at(-1).id, progress: 100 }, record, makeId);
  } else throw new Error('Unknown command');
}
