import { proxyJSON } from "@/lib/casa-pepe-server";

const ACTIONS = new Set(["start", "impact", "twist", "reset"]);

export async function POST(
  request: Request,
  context: RouteContext<"/api/casa-pepe/demo/[action]">,
) {
  const { action } = await context.params;
  if (!ACTIONS.has(action)) {
    return Response.json({ message: "Control de demo no permitido." }, { status: 404 });
  }
  const body = action === "start" ? await request.text() : undefined;
  return proxyJSON(`/demo/${action}`, {
    method: "POST",
    body: body || undefined,
  });
}
