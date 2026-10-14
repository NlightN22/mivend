import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopyToClipboard } from '../../composables/useCopyToClipboard';

describe('useCopyToClipboard', () => {
    const writeText = vi.fn();

    beforeEach(() => {
        vi.useFakeTimers();
        writeText.mockReset();
        vi.stubGlobal('navigator', { clipboard: { writeText } });
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('copies and flips copied back after a moment', async () => {
        writeText.mockResolvedValue(undefined);
        const { copied, copy } = useCopyToClipboard();
        expect(await copy('100-1')).toBe(true);
        expect(writeText).toHaveBeenCalledWith('100-1');
        expect(copied.value).toBe(true);
        vi.advanceTimersByTime(1600);
        expect(copied.value).toBe(false);
    });

    it('reports failure without marking copied', async () => {
        writeText.mockRejectedValue(new Error('denied'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { copied, copy } = useCopyToClipboard();
        expect(await copy('x')).toBe(false);
        expect(copied.value).toBe(false);
    });
});
