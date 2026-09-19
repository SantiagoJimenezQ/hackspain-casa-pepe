import { proxyJSON } from '@/lib/casa-pepe-server';
import { TREE_EVENTS } from '@/lib/decision-tree';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const source = new URL(request.url).searchParams;
  const run = source.get('runIdentifier');
  const cursor = source.get('afterSequence') ?? '0';
  if (!run || !/^[a-zA-Z0-9_-]{1,200}$/.test(run) || !/^\d+$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) {
    return Response.json({ message: 'Invalid run or history cursor' }, { status: 400 });
  }
  const query = new URLSearchParams({ runIdentifier: run, afterSequence: cursor, limit: '500', types: TREE_EVENTS.join(',') });
  return proxyJSON(`/activity?${query}`, { signal: request.signal });
}
