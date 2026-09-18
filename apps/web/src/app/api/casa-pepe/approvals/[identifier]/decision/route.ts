import { proxyJSON } from "@/lib/casa-pepe-server";

type ApprovalDecisionRouteContext = {
  params: Promise<{ identifier: string }>;
};

export async function POST(
  request: Request,
  context: ApprovalDecisionRouteContext,
) {
  const { identifier } = await context.params;
  return proxyJSON(`/approvals/${encodeURIComponent(identifier)}/decision`, {
    method: "POST",
    body: await request.text(),
  });
}
