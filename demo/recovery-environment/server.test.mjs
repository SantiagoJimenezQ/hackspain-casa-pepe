import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createRecoveryEnvironment } from './server.mjs'
test('real recovery target: auth, dependencies, idempotency, delivery, run isolation', async () => {
 const key = randomBytes(32).toString('hex')
 const server = createRecoveryEnvironment(key)
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
 const base = `http://127.0.0.1:${server.address().port}`
 const post = (path, body) => fetch(base + path, {method: 'POST', headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'}, body: JSON.stringify(body)})
 try {
  assert.equal((await fetch(base + '/deliveries')).status, 401)
  const delivery = {runIdentifier: 'test-run', deliveryIdentifier: 'delivery-1'}
  assert.equal((await post('/deliveries', delivery)).status, 503)
  const route = {runIdentifier: 'test-run', actionIdentifier: 'route', serviceIdentifier: 'route-assignment', capacityUnits: 3}
  assert.equal((await post('/recovery/actions', route)).status, 409)
  assert.equal((await post('/recovery/actions', {...route, actionIdentifier: 'db', serviceIdentifier: 'orders-database', capacityUnits: 4})).status, 200)
  assert.equal((await post('/recovery/actions', route)).status, 200)
  assert.equal((await post('/recovery/actions', route)).status, 200)
  assert.equal((await post('/recovery/actions', {...route, capacityUnits: 0})).status, 400)
  const result = await (await post('/deliveries', delivery)).json()
  assert.equal(result.status, 'assigned'); assert.equal(result.deliveryIdentifier, delivery.deliveryIdentifier); assert.ok(result.routeIdentifier)
  assert.equal((await post('/deliveries', {...delivery, runIdentifier: 'old-run'})).status, 503)
 } finally { await new Promise(resolve => server.close(resolve)) }
})
