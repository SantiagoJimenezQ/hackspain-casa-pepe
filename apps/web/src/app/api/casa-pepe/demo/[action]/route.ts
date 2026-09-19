import { proxyJSON } from "@/lib/casa-pepe-server";

const ACTIONS = new Set(["start", "impact", "twist", "reset", "language"]);

type DemoRouteContext = {
  params: Promise<{ action: string }>;
};

function runQuery(request: Request): string {
  const runIdentifier = new URL(request.url).searchParams.get("runIdentifier");
  return runIdentifier ? `?runIdentifier=${encodeURIComponent(runIdentifier)}` : "";
}

export async function POST(
  request: Request,
  context: DemoRouteContext,
) {
  const { action } = await context.params;
  if (!ACTIONS.has(action)) {
    return Response.json({ message: "Control de demo no permitido." }, { status: 404 });
  }
  const carriesBody = action === "start" || action === "language";
  const body = carriesBody ? await request.text() : undefined;
  return proxyJSON(`/demo/${action}${runQuery(request)}`, {
    method: "POST",
    body: body || undefined,
  });
}
