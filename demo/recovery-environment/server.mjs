import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// Deliberately bounded delivery application used as the real recovery target.
export function createRecoveryEnvironment(apiKey) {
 if (!apiKey) throw new Error('RECOVERY_ENVIRONMENT_API_KEY is required')
 const runs = new Map()
 const actions = new Map()
 const requirements = { 'orders-database': 4, 'route-assignment': 3, 'package-tracking': 3, 'events-stream': 2 }
 return createServer(async (req, res) => {
  const reply = (status, body) => { res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(body)) }
  const provided = Buffer.from(req.headers.authorization ?? '')
  const expected = Buffer.from(`Bearer ${apiKey}`)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return reply(401, {error: 'Unauthorized'})
  try {
   const url = new URL(req.url, 'http://localhost')
   let raw = ''
   for await (const chunk of req) { raw += chunk; if (raw.length > 16000) return reply(413, {error: 'Body too large'}) }
   const body = raw ? JSON.parse(raw) : {}
   if (req.method === 'POST' && url.pathname === '/recovery/actions') {
    if (typeof body.runIdentifier !== 'string' || !body.runIdentifier || typeof body.actionIdentifier !== 'string' || !body.actionIdentifier || !Object.hasOwn(requirements, body.serviceIdentifier) || !Number.isInteger(body.capacityUnits) || body.capacityUnits !== requirements[body.serviceIdentifier]) return reply(400, {error: 'Invalid recovery action'})
    const key = JSON.stringify([body.runIdentifier, body.actionIdentifier])
    if (actions.has(key)) {
     const previous = actions.get(key)
     return JSON.stringify(previous.input) === JSON.stringify(body) ? reply(200, previous.result) : reply(409, {error: 'Action identifier reused'})
    }
    const run = runs.get(body.runIdentifier) ?? new Set()
    if (['route-assignment', 'package-tracking'].includes(body.serviceIdentifier) && !run.has('orders-database')) return reply(409, {error: 'Database must be restored first'})
    if (runs.size >= 100 && !runs.has(body.runIdentifier)) return reply(503, {error: 'Demo run limit reached; restart target'})
    run.add(body.serviceIdentifier); runs.set(body.runIdentifier, run)
    const result = {status: 'succeeded', detail: `${body.serviceIdentifier} activated in the demo recovery environment`}
    actions.set(key, {input: body, result})
    return reply(200, result)
   }
   if (req.method === 'GET' && url.pathname.startsWith('/recovery/services/')) {
    const service = decodeURIComponent(url.pathname.split('/')[3])
    const healthy = runs.get(url.searchParams.get('runIdentifier'))?.has(service)
    return reply(200, {status: healthy ? 'healthy' : 'down', detail: healthy ? 'Demo service responds' : 'Service unavailable for this run'})
   }
   if (req.method === 'POST' && url.pathname === '/deliveries') {
    if (typeof body.runIdentifier !== 'string' || typeof body.deliveryIdentifier !== 'string' || !body.deliveryIdentifier) return reply(400, {error: 'Invalid test delivery'})
    if (!runs.get(body.runIdentifier)?.has('route-assignment')) return reply(503, {error: 'Route assignment unavailable'})
    return reply(200, {runIdentifier: body.runIdentifier, deliveryIdentifier: body.deliveryIdentifier, routeIdentifier: `route-${body.deliveryIdentifier}`, status: 'assigned'})
   }
   reply(404, {error: 'Not found'})
  } catch { reply(400, {error: 'Invalid request'}) }
 })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const port = Number(process.env.RECOVERY_ENVIRONMENT_PORT ?? 4100)
 createRecoveryEnvironment(process.env.RECOVERY_ENVIRONMENT_API_KEY).listen(port, '127.0.0.1', () => console.log(`Demo recovery environment listening on 127.0.0.1:${port}`))
}
