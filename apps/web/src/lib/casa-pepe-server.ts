import "server-only";
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
  const headers = new Headers(init.headers);
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
