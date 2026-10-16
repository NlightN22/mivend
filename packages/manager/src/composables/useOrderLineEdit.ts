import { ref, type Ref } from 'vue';
import {
    changeOrderLineQuantity,
    fetchOrderLineAvailability,
    removeOrderLine,
    splitOrderLinesByStock,
    type OrderLineAvailability,
    type SplitOutcome,
} from '../api/orderLineEdit';

export function useOrderLineEdit(orderId: Ref<string>, onChanged: () => void) {
    const availability = ref<Map<string, OrderLineAvailability>>(new Map());
    const busy = ref(false);
    const error = ref('');
    const lastSplit = ref<SplitOutcome[]>([]);
    let loadSeq = 0;

    async function load(): Promise<void> {
        const seq = (loadSeq += 1);
        try {
            const rows = await fetchOrderLineAvailability(orderId.value);
            if (seq === loadSeq) availability.value = new Map(rows.map(r => [r.orderLineId, r]));
        } catch (e) {
            if (seq === loadSeq)
                error.value = e instanceof Error ? e.message : 'Could not load stock';
        }
    }

    async function run(action: () => Promise<void>): Promise<void> {
        busy.value = true;
        error.value = '';
        try {
            await action();
            onChanged();
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'The change was not applied';
        } finally {
            busy.value = false;
        }
    }

    const setQuantity = (lineId: string, quantity: number): Promise<void> =>
        run(async () => {
            lastSplit.value = [];
            await changeOrderLineQuantity(orderId.value, lineId, quantity);
        });

    const remove = (lineId: string): Promise<void> =>
        run(async () => {
            lastSplit.value = [];
            await removeOrderLine(orderId.value, lineId);
        });

    const cutToStock = (): Promise<void> =>
        run(async () => {
            lastSplit.value = await splitOrderLinesByStock(orderId.value);
        });

    return { availability, busy, error, lastSplit, load, setQuantity, remove, cutToStock };
}
