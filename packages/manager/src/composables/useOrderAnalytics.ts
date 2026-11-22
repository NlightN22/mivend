import { computed, onMounted, ref, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import { resolveDateRangePreset } from '@mivend/ui-kit/src/components/MvColumnFilter/dateRangePresets';
import {
    fetchOrderAnalytics,
    type OrderAnalyticsFixedFilter,
    type OrderAnalyticsRow,
    type OrderAnalyticsState,
    type OrderDimension,
    type OrderGranularity,
} from '../api/orderAnalytics';
import { isValidPeriod } from '../api/orderAnalyticsPeriod';
import { useUrlSyncedState } from './useUrlSyncedState';

export interface OrderAnalyticsFilters {
    [key: string]: string;
    from: string;
    to: string;
    granularity: OrderGranularity;
    dimension: OrderDimension;
}

export interface UseOrderAnalytics {
    filters: Ref<OrderAnalyticsFilters>;
    rows: Ref<OrderAnalyticsRow[]>;
    state: Ref<OrderAnalyticsState>;
    limited: Ref<boolean>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    periodValid: Ref<boolean>;
    reload: () => Promise<void>;
}

// The last 30 days by month; an embedded report starts from the dimension its fixed entity leaves open.
export function defaultOrderAnalyticsFilters(
    dimension: OrderDimension = 'CUSTOMER',
): OrderAnalyticsFilters {
    const { from, to } = resolveDateRangePreset('last30');
    return { from, to, granularity: 'MONTH', dimension };
}

export function useOrderAnalytics(options: {
    fixed?: OrderAnalyticsFixedFilter;
    dimension?: OrderDimension;
    urlPrefix?: string;
}): UseOrderAnalytics {
    const defaults = defaultOrderAnalyticsFilters(options.dimension);
    const filters = ref<OrderAnalyticsFilters>({ ...defaults });
    const rows = ref<OrderAnalyticsRow[]>([]);
    const state = ref<OrderAnalyticsState>('OK');
    const limited = ref(false);
    const failed = ref(false);
    const page = ref(1);
    const urlState = useUrlSyncedState(defaults, options.urlPrefix ?? '');
    urlState.fromQuery(filters.value, page);

    const periodValid = computed(() => isValidPeriod(filters.value));
    const { loading, run } = useLatestRequest(
        () => fetchOrderAnalytics(filters.value, options.fixed),
        result => {
            rows.value = result.rows;
            state.value = result.state;
            limited.value = result.limitedToVisibleCustomers;
            failed.value = false;
        },
    );

    async function reload(): Promise<void> {
        if (!periodValid.value) return;
        try {
            await run();
        } catch {
            failed.value = true;
            rows.value = [];
        }
    }

    watch(
        filters,
        () => {
            urlState.toQuery(filters.value, page);
            void reload();
        },
        { deep: true },
    );
    onMounted(() => void reload());

    return { filters, rows, state, limited, loading, failed, periodValid, reload };
}
