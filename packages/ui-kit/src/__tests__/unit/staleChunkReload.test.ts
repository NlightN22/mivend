import { describe, expect, it, vi } from 'vitest';
import { reloadOnStaleChunk } from '../../utils/staleChunkReload';

function fakeWindow(): { win: Window; fire: () => void; reload: ReturnType<typeof vi.fn> } {
    let handler: (event: Event) => void = () => {};
    const store = new Map<string, string>();
    const reload = vi.fn();
    const win = {
        addEventListener: (_: string, h: (event: Event) => void) => (handler = h),
        sessionStorage: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, v),
        },
        location: { reload },
    } as unknown as Window;
    return { win, fire: () => handler({ preventDefault: () => {} } as Event), reload };
}

describe('reloadOnStaleChunk', () => {
    it('reloads once and does not loop on repeated failures', () => {
        const { win, fire, reload } = fakeWindow();
        reloadOnStaleChunk(win);
        fire();
        fire();
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
