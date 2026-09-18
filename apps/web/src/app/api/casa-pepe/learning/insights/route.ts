import { proxyJSON } from "@/lib/casa-pepe-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJSON("/learning/insights?scenarioIdentifier=meteorite-eu-west-1-es");
}
