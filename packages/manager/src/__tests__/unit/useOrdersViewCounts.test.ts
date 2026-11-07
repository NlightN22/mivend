import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, ref } from 'vue';

vi.mock('vue', async importOriginal => ({
    ...(await importOriginal<typeof import('vue')>()),
    onMounted: (fn: () => void) => fn(),
    onUnmounted: () => undefined,
}));

const fetchCounts = vi.fn();
vi.mock('../../api/orders-counts', () => ({
    fetchOrdersViewCounts: (...a: unknown[]) => fetchCounts(...a),
}));
vi.mock('@mivend/ui-kit', async () => ({
    useLatestRequest: (await import('../../../../ui-kit/src/composables/useLatestRequest'))
        .useLatestRequest,
    useDebouncedCallback: (await import('../../../../ui-kit/src/composables/useDebouncedCallback'))
        .useDebouncedCallback,
}));
vi.mock('../../stores/orderStatuses', () => ({
    useOrderStatusesStore: () => ({ load: async () => undefined, rejectedCodes: [] }),
}));

import { BLANK_ORDERS_FILTERS } from '../../api/orders-list';
import { useOrdersViewCounts } from '../../composables/useOrdersViewCounts';

const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await nextTick();
};

describe('useOrdersViewCounts loading flag', () => {
    beforeEach(() => {
        vi.useRealTimers();
        setActivePinia(createPinia());
        fetchCounts.mockReset();
    });

    it('is loading on the first fetch and again on a refetch after the search changes', async () => {
        let resolve: (v: unknown) => void = () => undefined;
        fetchCounts.mockImplementation(() => new Promise(r => (resolve = r)));
        const filters = ref({ ...BLANK_ORDERS_FILTERS });
        const state = useOrdersViewCounts(undefined, filters);
        await flush();
        expect(state.loading.value).toBe(true);
        resolve({ counts: { all: 3 }, pendingApprovalOrderIds: new Set() });
        await flush();
        expect(state.loading.value).toBe(false);
        expect(state.counts.value).toEqual({ all: 3 });

        vi.useFakeTimers();
        filters.value = { ...filters.value, search: 'abc' };
        await nextTick();
        await vi.advanceTimersByTimeAsync(300);
        expect(state.loading.value).toBe(true);
        expect(fetchCounts).toHaveBeenCalledTimes(2);
    });
});
