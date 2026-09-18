import { proxyJSON } from "@/lib/casa-pepe-server";

export async function POST(
  request: Request,
  context: RouteContext<"/api/casa-pepe/approvals/[identifier]/decision">,
) {
  const { identifier } = await context.params;
  return proxyJSON(`/approvals/${encodeURIComponent(identifier)}/decision`, {
    method: "POST",
    body: await request.text(),
  });
}
