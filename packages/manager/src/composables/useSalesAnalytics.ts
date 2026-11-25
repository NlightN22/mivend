import { computed, onMounted, ref, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import { resolveDateRangePreset } from '@mivend/ui-kit/src/components/MvColumnFilter/dateRangePresets';
import type { OrderAnalyticsState, OrderGranularity } from '../api/orderAnalytics';
import { conditionsToEntityFilters } from '../api/orderAnalyticsFilter';
import { isValidPeriod } from '../api/orderAnalyticsPeriod';
import {
    fetchSalesAnalytics,
    SALES_FILTER_KEYS,
    type SalesAnalyticsRow,
    type SalesDimension,
} from '../api/salesAnalytics';
import { useUrlSyncedState } from './useUrlSyncedState';

export interface SalesAnalyticsFilters {
    [key: string]: string;
    from: string;
    to: string;
    granularity: OrderGranularity;
    dimension: SalesDimension;
}

export interface UseSalesAnalytics {
    filters: Ref<SalesAnalyticsFilters>;
    conditions: Ref<FilterCondition[]>;
    mainManagerOnly: Ref<boolean>;
    rows: Ref<SalesAnalyticsRow[]>;
    state: Ref<OrderAnalyticsState>;
    limited: Ref<boolean>;
    correctionsWithoutEffect: Ref<number>;
    unresolvedCurrencies: Ref<string[]>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    periodValid: Ref<boolean>;
    reload: () => Promise<void>;
}

// The last 30 days by month, per customer.
export function defaultSalesAnalyticsFilters(): SalesAnalyticsFilters {
    const { from, to } = resolveDateRangePreset('last30');
    return { from, to, granularity: 'MONTH', dimension: 'COUNTERPARTY' };
}

export function useSalesAnalytics(urlPrefix = ''): UseSalesAnalytics {
    const defaults = defaultSalesAnalyticsFilters();
    const filters = ref<SalesAnalyticsFilters>({ ...defaults });
    const conditions = ref<FilterCondition[]>([]);
    const mainManagerOnly = ref(false);
    const rows = ref<SalesAnalyticsRow[]>([]);
    const state = ref<OrderAnalyticsState>('OK');
    const limited = ref(false);
    const correctionsWithoutEffect = ref(0);
    const unresolvedCurrencies = ref<string[]>([]);
    const failed = ref(false);
    const page = ref(1);
    const urlState = useUrlSyncedState(defaults, urlPrefix);
    urlState.fromQuery(filters.value, page);

    const periodValid = computed(() => isValidPeriod(filters.value));
    const { loading, run } = useLatestRequest(
        () =>
            fetchSalesAnalytics(filters.value, {
                entityFilters: conditionsToEntityFilters(conditions.value, SALES_FILTER_KEYS),
                mainManagerOnly: mainManagerOnly.value,
            }),
        result => {
            rows.value = result.rows;
            state.value = result.state;
            limited.value = result.limitedToVisibleCustomers;
            correctionsWithoutEffect.value = result.correctionsWithoutEffect;
            unresolvedCurrencies.value = result.unresolvedCurrencies;
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
    watch([conditions, mainManagerOnly], () => void reload(), { deep: true });
    onMounted(() => void reload());

    return {
        filters,
        conditions,
        mainManagerOnly,
        rows,
        state,
        limited,
        correctionsWithoutEffect,
        unresolvedCurrencies,
        loading,
        failed,
        periodValid,
        reload,
    };
}
