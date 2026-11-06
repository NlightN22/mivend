import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import {
    useDebouncedTextModel,
    type DebouncedTextModel,
} from '../../composables/useDebouncedTextModel';

function setup(delayMs = 400): {
    model: DebouncedTextModel;
    parent: { value: string };
    commits: string[];
} {
    const parent = ref('');
    const commits: string[] = [];
    const model = effectScope().run(() =>
        useDebouncedTextModel(
            () => parent.value,
            v => {
                commits.push(v);
                parent.value = v;
            },
            delayMs,
        ),
    )!;
    return { model, parent, commits };
}

describe('useDebouncedTextModel', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('commits a multi-character value once, after the pause', async () => {
        const { model, commits } = setup();
        for (const v of ['i', 'iv', 'iva', 'ivan']) {
            model.input(v);
            vi.advanceTimersByTime(100);
        }
        expect(commits).toEqual([]);
        vi.advanceTimersByTime(400);
        expect(commits).toEqual(['ivan']);
        expect(model.text.value).toBe('ivan');
    });

    it('keeps characters typed after a commit when the commit is echoed back', async () => {
        const { model, parent, commits } = setup();
        model.input('iv');
        vi.advanceTimersByTime(400);
        model.input('iva');
        await nextTick();
        expect(parent.value).toBe('iv');
        expect(model.text.value).toBe('iva');
        vi.advanceTimersByTime(400);
        expect(commits).toEqual(['iv', 'iva']);
    });

    it('does not echo an unchanged value', async () => {
        const { model, commits } = setup();
        model.input('iv');
        vi.advanceTimersByTime(400);
        model.input('iv');
        vi.advanceTimersByTime(400);
        expect(commits).toEqual(['iv']);
    });

    it('clear commits an empty value and cancels the pending commit', async () => {
        const { model, commits } = setup();
        model.input('iv');
        model.clear();
        vi.advanceTimersByTime(400);
        expect(commits).toEqual(['']);
    });

    it('flush commits a pending value immediately (used when the input unmounts)', async () => {
        const { model, commits } = setup();
        model.input('iv');
        model.flush();
        expect(commits).toEqual(['iv']);
    });

    it('follows an external change when nothing is pending', async () => {
        const { model, parent } = setup();
        parent.value = 'from-url';
        await nextTick();
        expect(model.text.value).toBe('from-url');
    });
});
