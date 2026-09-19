import { BackendAPIError, backendFetch } from "@/lib/casa-pepe-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["runIdentifier", "afterSequence"]) {
    const value = incoming.get(key);
    if (value) query.set(key, value);
  }
  const upstream = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let downstream: ReadableStreamDefaultController<Uint8Array> | undefined;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", finish);
    downstream?.close();
    upstream.abort();
    void reader?.cancel().catch(() => {});
  };
  // Include connection setup in the budget and cancel stalled upstream streams.
  const deadline = setTimeout(finish, 250_000);
  request.signal.addEventListener("abort", finish, { once: true });
  if (request.signal.aborted) finish();
  try {
    const headers = new Headers({ Accept: "text/event-stream" });
    const lastEventId = request.headers.get("last-event-id");
    if (lastEventId) headers.set("Last-Event-ID", lastEventId);
    const response = await backendFetch(`/activity/stream?${query.toString()}`, {
      headers,
      signal: upstream.signal,
    });
    if (!response.body) throw new Error("Missing activity stream body");
    reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        downstream = controller;
        if (finished) {
          controller.close();
          void reader?.cancel().catch(() => {});
        }
      },
      async pull(controller) {
        try {
          const result = await reader!.read();
          if (finished) return;
          if (result.done) finish();
          else controller.enqueue(result.value);
        } catch (error) {
          if (finished) return;
          downstream = undefined;
          controller.error(error);
          finish();
        }
      },
      cancel() {
        downstream = undefined;
        finish();
      },
    });
    return new Response(body, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    });
  } catch (error) {
    finish();
    const known = error instanceof BackendAPIError ? error : null;
    return Response.json(
      { message: known?.message ?? "No se pudo abrir el canal de actividad." },
      { status: known?.status ?? 502 },
    );
  }
}
