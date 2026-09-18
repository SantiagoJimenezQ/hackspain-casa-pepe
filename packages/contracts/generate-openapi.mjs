import { writeFileSync } from 'node:fs';
const str = { type: 'string' };
const bool = { type: 'boolean' };
const num = { type: 'number' };
const int = (minimum = 0, maximum) => ({ type: 'integer', minimum, ...(maximum === undefined ? {} : { maximum }) });
const enumeration = (...values) => ({ type: 'string', enum: values });
const health = enumeration('healthy', 'degraded', 'unavailable');
const uuid = { type: 'string', format: 'uuid' };
const time = { type: 'string', format: 'date-time' };
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const array = items => ({ type: 'array', items });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const guard = { expectedRunId: uuid, expectedRevision: int() };
const request = (properties = {}, required = []) => object({ ...properties, ...guard }, required);
const schemas = {
  EmptyCommand: request(),
  ResetCommand: request({ mode: { ...enumeration('manual', 'randomized'), default: 'manual' }, seed: { ...int(0, 4294967295), default: 42 },
    difficulty: { ...enumeration('easy', 'medium', 'hard'), default: 'medium' }, automaticEvents: { ...bool, default: true }, maxConcurrentDisruptions: { ...int(1, 3), default: 2 } }),
  AdvanceCommand: request({ minutes: { ...int(1, 60), default: 1 } }),
  CapacityCommand: request({ capacity: int(0, 2) }, ['capacity']),
  ServiceCommand: request({ serviceId: enumeration('route-assignment', 'package-tracking'), status: health }, ['serviceId', 'status']),
  RegionCommand: { ...request({ regionId: str, status: health, capacity: int(0, 100) }, ['regionId']), anyOf: [{ required: ['status'] }, { required: ['capacity'] }] },
  StartMigrationCommand: request({ companyId: str, targetRegionId: str }, ['companyId', 'targetRegionId']),
  UpdateMigrationCommand: { oneOf: [
    { ...request({ migrationId: uuid, progress: int(0, 100) }, ['migrationId', 'progress']), not: { required: ['failureReason'] } },
    { ...request({ migrationId: uuid, failureReason: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' } }, ['migrationId', 'failureReason']), not: { required: ['progress'] } },
  ] },
  RestoreCompanyCommand: request({ companyId: str }, ['companyId']),
  Simulation: object({ mode: enumeration('manual', 'randomized'), seed: int(0, 4294967295), difficulty: enumeration('easy', 'medium', 'hard'),
    automaticEvents: bool, maxConcurrentDisruptions: int(1, 3), paused: bool, elapsedMinutes: int(), generatedDisruptions: int(0, 1) }),
  Region: object({ id: str, name: str, latitude: num, longitude: num, role: enumeration('primary', 'backup'), status: health, capacity: int(), allocated: int(), available: int() }),
  Company: object({ id: str, name: str, users: int(), priority: int(1), priorityReason: str, homeRegionId: str, regionId: str, status: health, migrationId: nullable(uuid) }),
  Migration: object({ id: uuid, companyId: str, sourceRegionId: str, targetRegionId: str, status: enumeration('running', 'succeeded', 'failed', 'cancelled'),
    progress: int(0, 100), durationMinutes: int(1), etaMinutes: nullable(int()), failureReason: nullable(str), startedAt: time, completedAt: nullable(time) }),
  Event: object({ id: uuid, runId: uuid, revision: int(1), occurredAt: time, simulationMinute: int(), source: enumeration('simulation'), type: str,
    detail: { anyOf: [str, { type: 'object', additionalProperties: { anyOf: [str, num] } }] } }),
  Summary: object({ totalCompanies: int(), totalUsers: int(), affectedCompanies: int(), affectedUsers: int(), online: int(), degraded: int(), offline: int(), companiesOnlinePercent: int(0, 100),
    migration: object({ total: int(), running: int(), succeeded: int(), failed: int(), cancelled: int(), progressPercent: int(0, 100) }) }),
  Agent: object({ simulated: { const: true }, status: enumeration('idle', 'awaiting_action', 'recovering', 'monitoring'), currentAction: str, lastEventId: nullable(uuid) }),
  StatusSnapshot: object({ simulated: { const: true }, runId: uuid, revision: int(1), updatedAt: time, region: str, status: health,
    simulation: ref('Simulation'), incident: nullable(object({ id: uuid, status: enumeration('active', 'resolved'), startedAt: time, resolvedAt: nullable(time) })),
    services: array(object({ id: str, status: health, recoveryCapacityRequired: int(1) })), backup: object({ region: str, capacity: int(0, 2) }),
    regions: array(ref('Region')), companies: array(ref('Company')), migrations: array(ref('Migration')), summary: ref('Summary'), agent: ref('Agent'), events: array(ref('Event')) }),
  ApiError: object({ error: object({ code: enumeration('INVALID_REQUEST', 'STALE_STATE', 'NOT_FOUND', 'BODY_TOO_LARGE'), message: str }) }),
};
const json = schema => ({ 'application/json': { schema } });
const error = description => ({ description, content: json(ref('ApiError')) });
const paths = {
  '/health': { get: { operationId: 'getHealth', summary: 'Check API process health, independently of simulated AWS', responses: { 200: { description: 'Process is responding', content: json(object({ status: enumeration('ok') })) } } } },
  '/api/status': { get: { operationId: 'getStatus', summary: 'Read complete snapshot; never advances time or draws randomness', responses: { 200: { description: 'Current state', content: json(ref('StatusSnapshot')) } } } },
  '/api/openapi.json': { get: { operationId: 'getOpenApi', summary: 'Download this OpenAPI specification', responses: { 200: { description: 'OpenAPI 3.1 document', content: json({ type: 'object' }) } } } },
};
const endpoints = [
  ['/api/incident/start', 'startIncident', 'Start the primary regional outage; idempotent while active', 'EmptyCommand', {}],
  ['/api/incident/stop', 'stopIncident', 'Resolve incident, restore infrastructure, cancel migrations and pause clock', 'EmptyCommand', {}],
  ['/api/simulation/reset', 'resetSimulation', 'Discard run and initialize config; defaults to manual mode; always paused', 'ResetCommand', { mode: 'randomized', seed: 42, difficulty: 'medium', automaticEvents: true, maxConcurrentDisruptions: 2 }],
  ['/api/simulation/pause', 'pauseSimulation', 'Pause automatic clock; manual advance and injections still work', 'EmptyCommand', {}],
  ['/api/simulation/resume', 'resumeSimulation', 'Advance one simulated minute per server timer tick (approximately one real second)', 'EmptyCommand', {}],
  ['/api/simulation/advance', 'advanceSimulation', 'Advance 1–60 simulated minutes synchronously, even while paused', 'AdvanceCommand', { minutes: 1 }],
  ['/api/simulation/capacity', 'setServiceCapacity', 'Legacy service-recovery units; does not alter company hosting slots', 'CapacityCommand', { capacity: 1 }],
  ['/api/simulation/service', 'setServiceHealth', 'Manually inject primary service health', 'ServiceCommand', { serviceId: 'route-assignment', status: 'healthy' }],
  ['/api/simulation/region', 'setRegion', 'Inject region health/capacity; capacity cannot fall below allocated slots', 'RegionCommand', { regionId: 'eu-west-2', capacity: 1 }],
  ['/api/migrations/start', 'startMigration', 'Reserve a healthy destination slot; no agent decision is made here', 'StartMigrationCommand', { companyId: 'alphatech', targetRegionId: 'eu-west-2' }],
  ['/api/migrations/update', 'updateMigration', 'Manual monotonic progress override or failure; 100 completes placement', 'UpdateMigrationCommand', { migrationId: '00000000-0000-4000-8000-000000000001', progress: 45 }],
  ['/api/simulation/company/restore', 'restoreCompany', 'Demo override: instantly migrate to the first healthy backup with room', 'RestoreCompanyCommand', { companyId: 'alphatech' }],
];
for (const [path, operationId, summary, schema, example] of endpoints) {
  paths[path] = { post: { operationId, summary,
    description: 'All commands return a complete snapshot. Optional expectedRunId/expectedRevision guards are checked before mutation. Unknown fields are ignored. See API.md for state preconditions, replay semantics and retry rules.',
    requestBody: { required: !['EmptyCommand', 'ResetCommand', 'AdvanceCommand'].includes(schema), content: { 'application/json': { schema: ref(schema), example } } },
    responses: { 200: { description: 'Command applied (or idempotent no-op)', content: json(ref('StatusSnapshot')) },
      400: error('Malformed JSON, invalid input or invalid domain transition; no mutation'),
      409: error('STALE_STATE: supplied run/revision does not match'), 413: error('Body exceeds 8192 bytes'), 404: error('Unknown endpoint or unsupported method') },
  } };
}
const spec = { openapi: '3.1.0', info: { title: 'Casa Pepe simulation API', version: '0.2.0', description: 'Local, in-memory simulated AWS incident environment. No real agent or AWS actions. API.md is the companion integration guide.' },
  servers: [{ url: 'http://127.0.0.1:4000' }], paths, components: { schemas } };
writeFileSync(new URL('./openapi.json', import.meta.url), JSON.stringify(spec, null, 2) + '\n');
