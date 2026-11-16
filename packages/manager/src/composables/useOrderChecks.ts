import { tr } from '../utils/lazyLabels';
import { computed, ComputedRef, ref, type Ref } from 'vue';
import { fetchOrderChecks, recomputeOrderChecks } from '../api/orderChecks';
import { findingsByLine, type OrderCheckFinding } from '../utils/orderCheckMessages';

export interface UseOrderChecks {
    findings: Ref<OrderCheckFinding[]>;
    loading: Ref<boolean>;
    recomputing: Ref<boolean>;
    error: Ref<string>;
    byLine: ComputedRef<Map<string, OrderCheckFinding[]>>;
    hasStale: ComputedRef<boolean>;
    computedAt: ComputedRef<string>;
    load: () => Promise<void>;
    recompute: () => Promise<void>;
}

export function useOrderChecks(orderId: Ref<string>): UseOrderChecks {
    const findings = ref<OrderCheckFinding[]>([]);
    const loading = ref(false);
    const recomputing = ref(false);
    const error = ref('');

    const byLine = computed(() => findingsByLine(findings.value));
    const hasStale = computed(() => findings.value.some(f => f.stale));
    const computedAt = computed(() => findings.value[0]?.computedAt ?? null);

    async function load(): Promise<void> {
        loading.value = true;
        error.value = '';
        try {
            findings.value = await fetchOrderChecks(orderId.value);
        } catch (e) {
            error.value = e instanceof Error ? e.message : tr('orderDetail.checks.loadFailed');
        } finally {
            loading.value = false;
        }
    }

    async function recompute(): Promise<void> {
        recomputing.value = true;
        error.value = '';
        try {
            findings.value = await recomputeOrderChecks(orderId.value);
        } catch (e) {
            error.value = e instanceof Error ? e.message : tr('orderDetail.checks.recomputeFailed');
        } finally {
            recomputing.value = false;
        }
    }

    return { findings, loading, recomputing, error, byLine, hasStale, computedAt, load, recompute };
}
