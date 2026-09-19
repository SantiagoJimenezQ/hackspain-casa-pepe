import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTreeHistory } from './decision-tree-history';
const event = (sequence: number, runIdentifier = 'run') => ({ sequence, runIdentifier, identifier: `e${sequence}`, type: 'plan.created' });
afterEach(() => vi.unstubAllGlobals());
describe('tree history cursor', () => {
  it('loads past the activity window using exclusive sequence cursors', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ items: [event(2), event(10)], total: 3 })).mockResolvedValueOnce(Response.json({ items: [event(20)], total: 1 }));
    vi.stubGlobal('fetch', fetcher);
    const receive = vi.fn();
    expect(await loadTreeHistory('run', 0, new AbortController().signal, receive)).toBe(20);
    expect(fetcher.mock.calls[1][0]).toContain('afterSequence=10');
    expect(receive).toHaveBeenCalledTimes(2);
  });
  it('rejects another run and non-advancing pages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: [event(4, 'other')], total: 1 })));
    await expect(loadTreeHistory('run', 0, new AbortController().signal, vi.fn())).rejects.toThrow('ejecución');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: [event(4)], total: 1 })));
    await expect(loadTreeHistory('run', 4, new AbortController().signal, vi.fn())).rejects.toThrow('ejecución');
  });
  it('does not apply a response after cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: [event(1)], total: 1 })));
    const controller = new AbortController(); controller.abort();
    const receive = vi.fn();
    await loadTreeHistory('run', 0, controller.signal, receive);
    expect(receive).not.toHaveBeenCalled();
  });
});
