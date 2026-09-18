import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import spec from './openapi.json' with { type: 'json' };
import { createHarness } from '../harness/index.mjs';

// Contract smoke checker for the JSON Schema keywords used by this specification.
// Not a general-purpose OpenAPI validator.
function matches(value, schema) {
  if (schema.$ref) return matches(value, spec.components.schemas[schema.$ref.split('/').at(-1)]);
  if (schema.anyOf && !schema.anyOf.some(s => matches(value, s))) return false;
  if (schema.oneOf && schema.oneOf.filter(s => matches(value, s)).length !== 1) return false;
  if (schema.not && matches(value, schema.not)) return false;
  if (Object.hasOwn(schema, 'const') && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'null' && value !== null) return false;
  if (schema.type === 'integer' && !Number.isInteger(value)) return false;
  if (schema.type === 'number' && typeof value !== 'number') return false;
  if (schema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (schema.type === 'string' && typeof value !== 'string') return false;
  if (typeof value === 'number' && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
  if (typeof value === 'string') {
    if (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.format === 'date-time' && !Number.isFinite(Date.parse(value))) return false;
    if (schema.format === 'uuid' && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)) return false;
  }
  if (schema.type === 'array' && (!Array.isArray(value) || !value.every(item => matches(item, schema.items)))) return false;
  if (schema.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) return false;
  if (schema.required && !schema.required.every(key => Object.hasOwn(value, key))) return false;
  if (schema.properties && !Object.entries(schema.properties).every(([key, s]) => !Object.hasOwn(value, key) || matches(value[key], s))) return false;
  return true;
}

test('checked-in OpenAPI matches generator and all references resolve', () => {
  const before = readFileSync(new URL('./openapi.json', import.meta.url), 'utf8');
  execFileSync(process.execPath, ['packages/contracts/generate-openapi.mjs']);
  assert.equal(readFileSync(new URL('./openapi.json', import.meta.url), 'utf8'), before);
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) assert.ok(spec.components.schemas[value.$ref.split('/').at(-1)], value.$ref);
    for (const child of Object.values(value)) visit(child);
  };
  visit(spec);
  for (const path of Object.values(spec.paths)) {
    const media = path.post?.requestBody.content['application/json'];
    if (media) assert.ok(matches(media.example, media.schema), JSON.stringify(media.example));
  }
});

test('fixtures and runtime snapshots match documented response fields', () => {
  const schema = spec.components.schemas.StatusSnapshot;
  for (const file of ['status.example.json', 'status.incident.example.json', 'status.randomized.example.json']) {
    assert.ok(matches(JSON.parse(readFileSync(new URL(file, import.meta.url))), schema), file);
  }
  const h = createHarness();
  for (const [command, body] of [['reset', { mode: 'randomized' }], ['start', {}], ['migration-start', { companyId: 'alphatech', targetRegionId: 'eu-west-2' }], ['advance', { minutes: 30 }], ['stop', {}]]) {
    assert.ok(matches(h.apply(command, body), schema), command);
  }
});
