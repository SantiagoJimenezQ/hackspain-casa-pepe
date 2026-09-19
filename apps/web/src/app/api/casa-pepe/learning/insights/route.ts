import { proxyJSON } from "@/lib/casa-pepe-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJSON("/learning/insights?scenarioIdentifier=meteorite-me-south-1-es");
}
