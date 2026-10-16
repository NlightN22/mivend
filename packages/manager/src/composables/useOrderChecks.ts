import { computed, ref, type Ref } from 'vue';
import { fetchOrderChecks, recomputeOrderChecks } from '../api/orderChecks';
import { findingsByLine, type OrderCheckFinding } from '../utils/orderCheckMessages';

export function useOrderChecks(orderId: Ref<string>) {
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
            error.value = e instanceof Error ? e.message : 'Could not load ERP requirement checks';
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
            error.value = e instanceof Error ? e.message : 'Could not recompute the checks';
        } finally {
            recomputing.value = false;
        }
    }

    return { findings, loading, recomputing, error, byLine, hasStale, computedAt, load, recompute };
}
