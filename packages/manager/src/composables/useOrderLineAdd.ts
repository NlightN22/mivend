import { ref } from 'vue';
import { fetchLineDiscountLimits } from '../api/discountLimits';
import {
    addOrderLineBySku,
    findOrderLineBySku,
    searchVariants,
    type SkuMatch,
} from '../api/orderLineEdit';
import { requestPriceAdjustment } from '../api/priceAdjustment';
import { priceFromPercent, referencePrice } from '../utils/lineValueModel';

const MIN_QUERY = 2;

export type AddPriceMode = 'customer' | 'price' | 'percent';

// Inline add row: pick a product, set quantity and an optional price or discount, then add in one user action.
export function useOrderLineAdd(
    orderId: () => string,
    run: (action: () => Promise<void>) => Promise<boolean>,
) {
    const open = ref(false);
    const query = ref('');
    const matches = ref<SkuMatch[]>([]);
    const picked = ref<SkuMatch | null>(null);
    const quantity = ref(1);
    const price = ref('');
    const discount = ref('');
    const error = ref('');
    const notice = ref('');
    let seq = 0;

    function reset(): void {
        query.value = '';
        matches.value = [];
        picked.value = null;
        quantity.value = 1;
        price.value = '';
        discount.value = '';
        error.value = '';
    }

    function begin(): void {
        reset();
        notice.value = '';
        open.value = true;
    }

    function cancel(): void {
        reset();
        open.value = false;
    }

    async function search(value: string): Promise<void> {
        query.value = value;
        if (picked.value && value !== picked.value.sku) picked.value = null;
        const mine = (seq += 1);
        if (value.trim().length < MIN_QUERY) {
            matches.value = [];
            return;
        }
        const found = await searchVariants(value.trim()).catch(() => []);
        if (mine === seq) matches.value = found;
    }

    function pick(match: SkuMatch): void {
        picked.value = match;
        query.value = match.sku;
        matches.value = [];
        error.value = '';
    }

    function setPrice(value: string): void {
        price.value = value;
        discount.value = '';
    }

    function setDiscount(value: string): void {
        discount.value = value;
        price.value = '';
    }

    async function applyPrice(sku: string): Promise<void> {
        const wantsPrice = price.value.trim() !== '';
        const wantsPercent = discount.value.trim() !== '';
        if (!wantsPrice && !wantsPercent) return;
        try {
            const line = await findOrderLineBySku(orderId(), sku);
            if (!line) throw new Error('the new line was not found');
            let target = price.value;
            if (!wantsPrice) {
                const limits = await fetchLineDiscountLimits(orderId());
                const reference = referencePrice(
                    line.effectivePriceMinor,
                    limits.get(line.id)?.percent ?? null,
                    line.listPriceMinor,
                );
                target = priceFromPercent(reference, discount.value) ?? '';
            }
            const minor = Math.round(Number(target) * 100);
            if (!target || Number.isNaN(minor) || minor < 0) throw new Error('enter a valid price');
            const outcome = await requestPriceAdjustment(orderId(), line.id, minor);
            if (outcome.decision === 'requires-approval') {
                notice.value = `${sku} added; the price was sent for approval.`;
            }
        } catch (e) {
            const why = e instanceof Error ? e.message : 'the price was not applied';
            notice.value = `${sku} added, but the price was not applied: ${why}`;
        }
    }

    // A refusal stays in the add row; the line is added first, then the price goes through the price-entry path.
    async function submit(): Promise<boolean> {
        const chosen = picked.value;
        if (!chosen) {
            error.value = 'Choose a product first';
            return false;
        }
        let failed = false;
        error.value = '';
        notice.value = '';
        await run(async () => {
            try {
                await addOrderLineBySku(orderId(), chosen.sku, quantity.value);
            } catch (e) {
                failed = true;
                error.value = e instanceof Error ? e.message : 'The position was not added';
                return;
            }
            await applyPrice(chosen.sku);
        });
        if (!failed) cancel();
        return !failed;
    }

    return {
        open,
        query,
        matches,
        picked,
        quantity,
        price,
        discount,
        error,
        notice,
        begin,
        cancel,
        search,
        pick,
        setPrice,
        setDiscount,
        submit,
    };
}
