/** Anonymous session token is a bearer secret, never a public run identifier.
 * Next.js forwards the HttpOnly cookie as X-Casa-Pepe-Session alongside its API key.
 * 32 cryptographically random bytes encoded as 64 lowercase hexadecimal characters.
 * The backend persists SHA-256(token), never the token, as browserSessionId.
 * Missing/invalid sessions cannot access incident routes. API-key-only administration
 * remains separate. Provider callbacks use their existing signature and record IDs.
 */
export type BrowserSessionToken = string;
