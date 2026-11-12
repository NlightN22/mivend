import { tr } from '../utils/lazyLabels';
import { ref, type Ref } from 'vue';
import { fetchLineDiscountLimits, type LineDiscountLimit } from '../api/discountLimits';
import {
    fetchOrderLineAvailability,
    splitOrderLinesByStock,
    type OrderLineAvailability,
    type SplitOutcome,
} from '../api/orderLineEdit';

export function useOrderLineEdit(orderId: Ref<string>, onChanged: () => void) {
    const availability = ref<Map<string, OrderLineAvailability>>(new Map());
    const lineDiscounts = ref<Map<string, LineDiscountLimit>>(new Map());
    const busy = ref(false);
    const error = ref('');
    const lastSplit = ref<SplitOutcome[]>([]);
    const alreadyWithinStock = ref(false);
    let loadSeq = 0;

    async function load(): Promise<void> {
        const seq = (loadSeq += 1);
        try {
            const rows = await fetchOrderLineAvailability(orderId.value);
            if (seq === loadSeq) availability.value = new Map(rows.map(r => [r.orderLineId, r]));
        } catch (e) {
            if (seq === loadSeq)
                error.value = e instanceof Error ? e.message : tr('orderLines.lineEdit.stockFailed');
        }
    }

    // Needs the price adjustment right; without it (or on failure) no ceiling is shown, nothing is gated.
    async function loadCeilings(): Promise<void> {
        lineDiscounts.value = await fetchLineDiscountLimits(orderId.value).catch(() => new Map());
    }

    async function run(action: () => Promise<void>): Promise<boolean> {
        busy.value = true;
        error.value = '';
        lastSplit.value = [];
        alreadyWithinStock.value = false;
        try {
            await action();
            onChanged();
            return true;
        } catch (e) {
            error.value = e instanceof Error ? e.message : tr('orderLines.lineEdit.notApplied');
            return false;
        } finally {
            busy.value = false;
        }
    }

    const cutToStock = (): Promise<boolean> =>
        run(async () => {
            lastSplit.value = await splitOrderLinesByStock(orderId.value);
            alreadyWithinStock.value = lastSplit.value.length === 0;
        });

    return {
        availability,
        lineDiscounts,
        loadCeilings,
        busy,
        error,
        lastSplit,
        alreadyWithinStock,
        load,
        apply: run,
        cutToStock,
    };
}
