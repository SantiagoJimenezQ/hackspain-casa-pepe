import "server-only";
import { cookies, headers as requestHeaders } from "next/headers";
import { BROWSER_SESSION_COOKIE, BROWSER_SESSION_HEADER, validBrowserToken } from "@/lib/browser-session";
import { normalizeCasaPepeAPIBaseURL } from "@/lib/casa-pepe-url";

type BackendErrorBody = { message?: string | string[]; error?: string };

export class BackendAPIError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BackendAPIError";
  }
}

function apiRoot() {
  const configured = process.env.CASA_PEPE_API_BASE_URL?.trim();
  if (!configured) {
    throw new BackendAPIError(
      "Falta CASA_PEPE_API_BASE_URL en la configuración del frontend.",
      503,
    );
  }
  return normalizeCasaPepeAPIBaseURL(configured);
}

function apiKey() {
  const key = process.env.CASA_PEPE_API_KEY?.trim();
  if (!key) {
    throw new BackendAPIError(
      "Falta CASA_PEPE_API_KEY en la configuración del frontend.",
      503,
    );
  }
  return key;
}

export async function backendFetch(path: string, init: RequestInit = {}) {
  const token = (await cookies()).get(BROWSER_SESSION_COOKIE)?.value;
  if (!validBrowserToken(token)) throw new BackendAPIError("Refresh the page to create a browser session.", 401);
  // Browser identity is taken only from our HttpOnly cookie, never caller-provided headers.
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase())) {
    const incoming = await requestHeaders();
    const origin = incoming.get("origin");
    const host = incoming.get("host");
    const fetchSite = incoming.get("sec-fetch-site");
    if (fetchSite === "cross-site" || (origin && new URL(origin).host !== host)) {
      throw new BackendAPIError("Cross-origin actions are not allowed.", 403);
    }
  }
  const headers = new Headers(init.headers);
  headers.set(BROWSER_SESSION_HEADER, token);
  headers.set("Authorization", `API ${apiKey()}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${apiRoot()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (response.ok) return response;

  let message = `El backend respondió con ${response.status}.`;
  try {
    const body = (await response.json()) as BackendErrorBody;
    if (Array.isArray(body.message)) message = body.message.join(" ");
    else if (body.message) message = body.message;
    else if (body.error) message = body.error;
  } catch {
    // The status remains a useful, safe fallback for non-JSON upstream errors.
  }
  throw new BackendAPIError(message, response.status);
}

export async function proxyJSON(path: string, init?: RequestInit) {
  try {
    const response = await backendFetch(path, init);
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    const known = error instanceof BackendAPIError ? error : null;
    return Response.json(
      { message: known?.message ?? "No se pudo contactar con Casa Pepe." },
      { status: known?.status ?? 502 },
    );
  }
}
