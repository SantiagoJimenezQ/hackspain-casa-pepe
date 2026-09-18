import http from 'node:http';
import openapi from '../../packages/contracts/openapi.json' with { type: 'json' };
import { pathToFileURL } from 'node:url';
import { createHarness } from '../../packages/harness/index.mjs';

export function createServer() {
  const harness = createHarness();
  const timer = setInterval(() => harness.clockTick(), 1000);
  timer.unref();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', process.env.UI_ORIGIN || 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    function send(status, data) { res.writeHead(status); res.end(JSON.stringify(data)); }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') return send(200, { status: 'ok' });
    if (req.method === 'GET' && path === '/api/openapi.json') return send(200, openapi);
    if (req.method === 'GET' && path === '/api/status') return send(200, harness.snapshot());
    const commands = { '/api/incident/start': 'start', '/api/incident/stop': 'stop',
      '/api/simulation/reset': 'reset', '/api/simulation/pause': 'pause',
      '/api/simulation/resume': 'resume', '/api/simulation/advance': 'advance', '/api/simulation/capacity': 'capacity', '/api/simulation/service': 'service',
      '/api/simulation/region': 'region', '/api/migrations/start': 'migration-start',
      '/api/migrations/update': 'migration-update', '/api/simulation/company/restore': 'company-restore' };
    if (req.method !== 'POST' || !commands[path]) return send(404, { error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } });
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) return send(413, { error: { code: 'BODY_TOO_LARGE', message: 'Maximum body size is 8 KB' } });
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : {};
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Body must be a JSON object');
      send(200, harness.apply(commands[path], body));
    } catch (error) { send(error.code === 'STALE_STATE' ? 409 : 400, { error: { code: error.code === 'STALE_STATE' ? 'STALE_STATE' : 'INVALID_REQUEST', message: error.message } }); }
  });
  server.on('close', () => clearInterval(timer));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4000);
  createServer().listen(port, '127.0.0.1', () => console.log(`Simulated AWS API: http://127.0.0.1:${port}`));
}
