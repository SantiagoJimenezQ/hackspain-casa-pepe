/** Server-only adapters. Never send provider bodies, URLs, or credentials to logs. */
class IntegrationError extends Error {
  constructor(message, retryable = false) {
    super(message)
    this.retryable = retryable
  }
}
async function postJSON(url, token, body, key, timeoutMilliseconds) {
  let response
  try {
    response = await fetch(url, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMilliseconds),
    })
  } catch {
    throw new IntegrationError('Integration unavailable or timed out; outcome may be unknown', true)
  }
  if (!response.ok) throw new IntegrationError(`Integration returned HTTP ${response.status}`, response.status === 429 || response.status >= 500)
  try { return await response.json() } catch { throw new IntegrationError('Integration returned invalid JSON') }
}
async function sendIncidentEmail(config, message, key) {
  if (config.mode === 'simulated') return { reference: `simulated:${key}`, mode: 'simulated' }
  if (!config.apiKey || !config.from || !config.to) throw new IntegrationError('Live email requires RESEND_API_KEY, INCIDENT_EMAIL_FROM and INCIDENT_EMAIL_TO')
  const body = await postJSON('https://api.resend.com/emails', config.apiKey,
    { from: config.from, to: [config.to], subject: message.subject, text: message.text }, key, config.timeoutMilliseconds)
  if (!body || typeof body.id !== 'string' || !body.id) throw new IntegrationError('Email provider returned no receipt')
  return { reference: body.id, mode: 'live' }
}
module.exports = { IntegrationError, postJSON, sendIncidentEmail }
