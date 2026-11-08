import { ref } from 'vue';
import { addOrderLineBySku, searchVariantsBySku, type SkuMatch } from '../api/orderLineEdit';

const MIN_QUERY = 2;

// Typeahead by article only; adding goes through the shared edit runner so the table reloads once.
export function useOrderLineAdd(
    orderId: () => string,
    run: (action: () => Promise<void>) => Promise<boolean>,
) {
    const query = ref('');
    const matches = ref<SkuMatch[]>([]);
    let seq = 0;

    async function search(value: string): Promise<void> {
        query.value = value;
        const mine = (seq += 1);
        if (value.trim().length < MIN_QUERY) {
            matches.value = [];
            return;
        }
        const found = await searchVariantsBySku(value.trim()).catch(() => []);
        if (mine === seq) matches.value = found;
    }

    async function add(sku: string, quantity = 1): Promise<boolean> {
        const ok = await run(() => addOrderLineBySku(orderId(), sku, quantity));
        if (ok) {
            query.value = '';
            matches.value = [];
        }
        return ok;
    }

    return { query, matches, search, add };
}
