import { BackendAPIError, backendFetch } from "@/lib/casa-pepe-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["runIdentifier", "afterSequence"]) {
    const value = incoming.get(key);
    if (value) query.set(key, value);
  }
  try {
    const response = await backendFetch(`/activity/stream?${query.toString()}`, {
      headers: { Accept: "text/event-stream" },
    });
    return new Response(response.body, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    });
  } catch (error) {
    const known = error instanceof BackendAPIError ? error : null;
    return Response.json(
      { message: known?.message ?? "No se pudo abrir el canal de actividad." },
      { status: known?.status ?? 502 },
    );
  }
}
