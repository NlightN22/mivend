import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ value: null as { administratorName: string } | null }));
vi.mock('../../stores/acting', () => ({
    useActingStore: () => ({
        get session() {
            return session.value;
        },
        get isActing() {
            return session.value !== null;
        },
    }),
}));
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, string>) =>
            `t:${key}${params ? `:${params.manager}` : ''}`,
    }),
}));

import { useActingMode } from '../../composables/useActingMode';

describe('useActingMode', () => {
    it('is off without an acting session', () => {
        session.value = null;
        expect(useActingMode().isActing.value).toBe(false);
    });

    it('names the manager in the line', () => {
        session.value = { administratorName: 'Ivan Manager' };
        const mode = useActingMode();
        expect(mode.isActing.value).toBe(true);
        expect(mode.label.value).toBe('t:acting.line:Ivan Manager');
    });

    it('falls back to the generic line when the name is empty', () => {
        session.value = { administratorName: '' };
        expect(useActingMode().label.value).toBe('t:acting.lineUnknown');
    });
});
