export class IntegrationError extends Error { readonly retryable: boolean }
export function postJSON(url: string, token: string, body: unknown, key: string, timeoutMilliseconds: number): Promise<unknown>
export function sendIncidentEmail(config: {
  mode: 'simulated' | 'live'; apiKey: string; from: string; to: string; timeoutMilliseconds: number
}, message: { subject: string; text: string }, key: string): Promise<{ reference: string; mode: 'simulated' | 'live' }>
export function listReceivedEmails(config: { apiKey: string; timeoutMilliseconds: number }, query?: { limit?: number; after?: string; before?: string }): Promise<unknown>
export function getReceivedEmail(config: { apiKey: string; timeoutMilliseconds: number }, emailId: string): Promise<unknown>
