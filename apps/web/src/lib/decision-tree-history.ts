import type { ActivityRecord } from './casa-pepe-types';

/** Cursor pagination follows sequence, so newly appended events cannot shift pages. */
export async function loadTreeHistory(run: string, afterSequence: number, signal: AbortSignal, onPage: (items: ActivityRecord[]) => void) {
  let cursor = afterSequence;
  for (;;) {
    const query = new URLSearchParams({ runIdentifier: run, afterSequence: String(cursor) });
    const response = await fetch(`/api/casa-pepe/activity/tree?${query}`, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar el historial del incidente.');
    const page = await response.json();
    if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0) throw new Error('El historial recibido no es válido.');
    const items: ActivityRecord[] = page.items;
    if (items.some(item => item.runIdentifier !== run || !Number.isSafeInteger(item.sequence) || item.sequence <= cursor || typeof item.identifier !== 'string' || typeof item.type !== 'string')) throw new Error('El historial recibido no corresponde a esta ejecución.');
    if (signal.aborted) return cursor;
    if (!items.length) return cursor;
    const next = Math.max(...items.map(item => item.sequence));
    onPage(items);
    cursor = next;
    if (items.length >= page.total) return cursor;
  }
}
