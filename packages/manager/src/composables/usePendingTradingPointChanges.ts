import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import {
    acceptTradingPointChange,
    fetchPendingTradingPointChanges,
    rejectTradingPointChange,
    type PendingTradingPointChange,
} from '../api/customers';

export function usePendingTradingPointChanges(onDecided: () => void): {
    byPoint: ComputedRef<Map<string, PendingTradingPointChange>>;
    busyId: Ref<string | null>;
    error: Ref<string | null>;
    accept: (change: PendingTradingPointChange) => Promise<void>;
    reject: (change: PendingTradingPointChange, comment?: string) => Promise<void>;
} {
    const changes = ref<PendingTradingPointChange[]>([]);
    const busyId = ref<string | null>(null);
    const error = ref<string | null>(null);
    const byPoint = computed(() => new Map(changes.value.map(c => [c.tradingPointId, c])));

    async function load(): Promise<void> {
        changes.value = await fetchPendingTradingPointChanges();
    }

    async function decide(
        change: PendingTradingPointChange,
        run: () => Promise<void>,
    ): Promise<void> {
        busyId.value = change.id;
        error.value = null;
        try {
            await run();
            await load();
            onDecided();
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            await load().catch(() => undefined);
        } finally {
            busyId.value = null;
        }
    }

    onMounted(() => load().catch(() => undefined));

    return {
        byPoint,
        busyId,
        error,
        accept: change => decide(change, () => acceptTradingPointChange(change.id)),
        reject: (change, comment) =>
            decide(change, () => rejectTradingPointChange(change.id, comment)),
    };
}
