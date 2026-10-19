import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ru from '../i18n/ru/index';
import { useOrderStatusesStore } from '../stores/orderStatuses';

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru } });
vi.mock('vue-i18n', async importOriginal => ({
    ...(await importOriginal<typeof import('vue-i18n')>()),
    useI18n: () => i18n.global,
}));

import { useStatusGroupLabel } from '../pages/orders/useStatusGroupLabel';

function labelFor(code: string): string {
    const store = useOrderStatusesStore();
    store.statuses = [
        { code: 'A', name: 'Exact A', customerGroup: 'in_transit' },
        { code: 'B', name: 'Exact B', customerGroup: 'unknown_group' },
    ] as typeof store.statuses;
    return useStatusGroupLabel(() => code).value;
}

describe('useStatusGroupLabel', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('shows the group label', () => expect(labelFor('A')).toBe('В пути'));
    it('falls back to the status name for an unknown group', () =>
        expect(labelFor('B')).toBe('Exact B'));
    it('falls back to the code for an unknown status', () => expect(labelFor('Z')).toBe('Z'));
});
