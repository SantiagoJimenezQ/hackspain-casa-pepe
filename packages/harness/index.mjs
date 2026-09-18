import { randomUUID } from 'node:crypto';
import { createDashboard, dashboardSnapshot, applyDashboard, cancelMigrations, allocated } from './dashboard.mjs';

import { randomStream, DIFFICULTIES, scenarioConfig } from './random.mjs';

export function createHarness() {
  let state;
  let recoveryRandom;
  let disruptionRandom;
  function record(type, detail) {
    state.revision++;
    state.updatedAt = new Date().toISOString();
    state.events.push({ id: randomUUID(), runId: state.runId, revision: state.revision,
      occurredAt: state.updatedAt, simulationMinute: state.simulation.elapsedMinutes, source: 'simulation', type, detail });
  }
  function reset(body = {}) {
    const config = scenarioConfig(body);
    const initialRandom = randomStream(config.seed, 0x12345678);
    recoveryRandom = randomStream(config.seed, 0x87654321);
    disruptionRandom = randomStream(config.seed, 0xabcdef01);
    state = { simulated: true, runId: randomUUID(), revision: 0,
      region: 'eu-west-1', status: 'healthy', incident: null,
      services: ['route-assignment', 'package-tracking'].map(id => ({ id, status: 'healthy', recoveryCapacityRequired: 1 })),
      backup: { region: 'eu-west-2', capacity: 2 }, ...createDashboard(), events: [],
      simulation: { ...config, paused: true, elapsedMinutes: 0, generatedDisruptions: 0 } };
    if (config.mode === 'randomized') {
      for (const region of state.regions.filter(r => r.role === 'backup')) {
        const residents = allocated(state, region.id);
        // Never remove existing placements; vary spare hosting slots only.
        region.capacity = residents + Math.floor(initialRandom() * (config.difficulty === 'easy' ? 4 : config.difficulty === 'hard' ? 2 : 3));
      }
      // Every generated scenario has at least one viable first recovery action.
      const backup = state.regions.find(r => r.id === state.backup.region);
      backup.capacity = Math.max(1, backup.capacity);
    }
    record('simulation.reset', 'Fresh demo initialized');
  }
  function apply(command, body = {}) {
    if (body.expectedRunId !== undefined && body.expectedRunId !== state.runId) {
      const error = new Error('Run changed; fetch the current snapshot'); error.code = 'STALE_STATE'; throw error;
    }
    if (body.expectedRevision !== undefined && body.expectedRevision !== state.revision) {
      const error = new Error('Revision changed; fetch the current snapshot'); error.code = 'STALE_STATE'; throw error;
    }
    if (command === 'reset') reset(body);
    else if (command === 'pause' || command === 'resume') {
      if (state.simulation.mode !== 'randomized' || state.incident?.status !== 'active') throw new Error('An active randomized incident is required');
      const paused = command === 'pause';
      if (state.simulation.paused !== paused) {
        state.simulation.paused = paused;
        record(`simulation.${paused ? 'paused' : 'resumed'}`, 'Operator changed automatic clock');
      }
    } else if (command === 'advance') {
      if (state.simulation.mode !== 'randomized' || state.incident?.status !== 'active') throw new Error('An active randomized incident is required');
      const minutes = body.minutes ?? 1;
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new Error('minutes must be an integer from 1 to 60');
      for (let i = 0; i < minutes; i++) tick();
    } else if (command === 'start') {
      if (!state.incident || state.incident.status === 'resolved') {
        state.incident = { id: randomUUID(), status: 'active', startedAt: new Date().toISOString(), resolvedAt: null };
        state.status = 'unavailable';
        state.regions.find(r => r.id === state.region).status = 'unavailable';
        state.services.forEach(service => { service.status = 'unavailable'; });
        record('incident.started', 'Simulated AWS regional outage');
      }
    } else if (command === 'stop') {
      if (state.incident?.status === 'active') {
        state.incident.status = 'resolved';
        state.simulation.paused = true;
        state.incident.resolvedAt = new Date().toISOString();
        state.status = 'healthy';
        state.regions.forEach(r => { r.status = 'healthy'; });
        cancelMigrations(state);
        state.services.forEach(service => { service.status = 'healthy'; });
        record('incident.resolved', 'Simulated services restored by demo operator');
      }
    } else if (command === 'capacity') {
      if (!Number.isInteger(body.capacity) || body.capacity < 0 || body.capacity > 2) {
        throw new Error('capacity must be an integer between 0 and 2');
      }
      state.backup.capacity = body.capacity;
      record('backup.capacity_changed', { capacity: body.capacity });
    } else if (command === 'service') {
      const service = state.services.find(item => item.id === body.serviceId);
      if (!service || !['healthy', 'degraded', 'unavailable'].includes(body.status)) {
        throw new Error('Provide a known serviceId and status: healthy, degraded, or unavailable');
      }
      if (state.incident?.status !== 'active') throw new Error('Start an incident before changing service health');
      service.status = body.status;
      state.status = state.services.every(item => item.status === 'healthy') ? 'healthy'
        : state.services.every(item => item.status === 'unavailable') ? 'unavailable' : 'degraded';
      record('service.health_changed', { serviceId: service.id, status: service.status });
    } else {
      applyDashboard(state, command, body, record, randomUUID);
      if (command === 'migration-start' && state.simulation.mode === 'randomized') {
        const migration = state.migrations.at(-1);
        const rules = DIFFICULTIES[state.simulation.difficulty];
        migration.durationMinutes = rules.minDuration + Math.floor(recoveryRandom() * (rules.maxDuration - rules.minDuration + 1));
        migration.etaMinutes = migration.durationMinutes;
        record('migration.duration_sampled', { migrationId: migration.id, durationMinutes: migration.durationMinutes });
      }
    }
    return snapshot();
  }
  function tick() {
    state.simulation.elapsedMinutes++;
    const rules = DIFFICULTIES[state.simulation.difficulty];
    const running = state.migrations.filter(m => m.status === 'running');
    // At most one random secondary disruption per run, while recovery is under way.
    if (running.length && state.simulation.automaticEvents && state.simulation.generatedDisruptions === 0
        && state.regions.filter(r => r.status !== 'healthy').length < state.simulation.maxConcurrentDisruptions) {
      const candidates = state.regions.filter(r => r.role === 'backup' && r.status === 'healthy');
      if (candidates.length && disruptionRandom() < rules.disruptionChance) {
        const target = candidates[Math.floor(disruptionRandom() * candidates.length)];
        const status = disruptionRandom() < 0.5 ? 'degraded' : 'unavailable';
        state.simulation.generatedDisruptions++;
        record('simulation.disruption', { regionId: target.id, status, reason: 'Seeded secondary infrastructure fault during recovery' });
        applyDashboard(state, 'region', { regionId: target.id, status }, record, randomUUID);
      }
    }
    for (const migration of running.filter(m => m.status === 'running')) {
      const target = state.regions.find(r => r.id === migration.targetRegionId);
      const load = allocated(state, target.id) / target.capacity;
      const probability = rules.failureRate * (1 + load * 2);
      if (recoveryRandom() < probability) {
        applyDashboard(state, 'migration-update', { migrationId: migration.id,
          failureReason: `Simulated transfer timeout at ${Math.round(load * 100)}% destination slot utilization` }, record, randomUUID);
      } else {
        // Internal fractional progress is not exposed; accumulate using completed work minutes.
        migration.workMinutes = (migration.workMinutes ?? migration.progress * migration.durationMinutes / 100) + 1;
        applyDashboard(state, 'migration-update', { migrationId: migration.id,
          progress: Math.min(100, Math.floor(migration.workMinutes * 100 / migration.durationMinutes + 1e-9)) }, record, randomUUID, 'Simulation clock advanced recovery');
      }
    }
    record('simulation.advanced', { elapsedMinutes: state.simulation.elapsedMinutes });
  }
  function snapshot() {
    const result = structuredClone({ ...state, ...dashboardSnapshot(state) });
    for (const migration of result.migrations) delete migration.workMinutes;
    return result;
  }
  reset();
  return { snapshot, apply, clockTick() {
    if (!state.simulation.paused && state.incident?.status === 'active') apply('advance');
  } };
}
