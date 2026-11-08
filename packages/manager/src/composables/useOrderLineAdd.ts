import { computed, ref, watch } from 'vue';
import {
    addOrderLineBySku,
    fetchOrderLineQuote,
    findOrderLineBySku,
    searchVariants,
    type OrderLineQuote,
    type SkuMatch,
} from '../api/orderLineEdit';
import { requestPriceAdjustment } from '../api/priceAdjustment';
import { multipleMessage, notMultiple } from '../utils/quantityUnit';
import { percentFromPrice, priceFromPercent } from '../utils/lineValueModel';

const MIN_QUERY = 2;
const REQUOTE_DELAY_MS = 300;

// Inline add row: pick a product (its quote prefills price and discount), then add in one user action.
export function useOrderLineAdd(
    orderId: () => string,
    run: (action: () => Promise<void>) => Promise<boolean>,
) {
    const open = ref(false);
    const query = ref('');
    const matches = ref<SkuMatch[]>([]);
    const picked = ref<SkuMatch | null>(null);
    const quote = ref<OrderLineQuote | null>(null);
    const quantity = ref(1);
    const price = ref('');
    const discount = ref('');
    const error = ref('');
    const notice = ref('');
    let seq = 0;
    let quoteSeq = 0;
    let edited = false;
    let quotedQuantity = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const step = computed(() => quote.value?.multiple ?? 1);
    const multipleError = computed(() =>
        picked.value && quote.value && notMultiple(quantity.value, step.value)
            ? multipleMessage(picked.value.sku, step.value)
            : '',
    );

    const prefilled = (): string =>
        quote.value ? (quote.value.customerPrice / 100).toFixed(2) : '';

    function reset(): void {
        query.value = '';
        matches.value = [];
        picked.value = null;
        quote.value = null;
        quantity.value = 1;
        price.value = '';
        discount.value = '';
        error.value = '';
        edited = false;
        clearTimeout(timer);
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
        if (picked.value && value !== picked.value.sku) {
            picked.value = null;
            quote.value = null;
            quoteSeq += 1;
            edited = false;
        }
        const mine = (seq += 1);
        if (value.trim().length < MIN_QUERY) {
            matches.value = [];
            return;
        }
        const found = await searchVariants(value.trim()).catch(() => []);
        if (mine === seq) matches.value = found;
    }

    // Quotes the picked article for the current quantity; a hand-typed price survives, only its baseline moves.
    async function requote(): Promise<void> {
        const chosen = picked.value;
        if (!chosen) return;
        const mine = (quoteSeq += 1);
        try {
            const result = await fetchOrderLineQuote(orderId(), chosen.sku, quantity.value);
            if (mine !== quoteSeq) return;
            quote.value = result;
            quotedQuantity = quantity.value;
            error.value = '';
            if (edited) {
                discount.value = percentFromPrice(result.referencePrice, price.value) ?? '';
            } else {
                price.value = prefilled();
                discount.value = '0';
            }
        } catch (e) {
            if (mine === quoteSeq) {
                quote.value = null;
                error.value = e instanceof Error ? e.message : 'No price found';
            }
        }
    }

    async function pick(match: SkuMatch): Promise<void> {
        picked.value = match;
        query.value = match.sku;
        matches.value = [];
        error.value = '';
        quote.value = null;
        price.value = '';
        discount.value = '';
        edited = false;
        await requote();
        const multiple = (quote.value as OrderLineQuote | null)?.multiple ?? 1;
        if (notMultiple(quantity.value, multiple)) quantity.value = multiple;
    }

    watch(quantity, () => {
        clearTimeout(timer);
        if (picked.value) timer = setTimeout(() => void requote(), REQUOTE_DELAY_MS);
    });

    function setPrice(value: string): void {
        edited = true;
        price.value = value;
        if (quote.value) discount.value = percentFromPrice(quote.value.referencePrice, value) ?? '';
    }

    function setDiscount(value: string): void {
        edited = true;
        discount.value = value;
        const next = quote.value ? priceFromPercent(quote.value.referencePrice, value) : null;
        if (next !== null) price.value = next;
    }

    async function applyChangedPrice(sku: string): Promise<void> {
        const minor = Math.round(Number(price.value) * 100);
        if (minor === quote.value?.customerPrice) return;
        try {
            if (price.value.trim() === '' || Number.isNaN(minor) || minor < 0) {
                throw new Error('enter a valid price');
            }
            const line = await findOrderLineBySku(orderId(), sku);
            if (!line) throw new Error('the new line was not found');
            const outcome = await requestPriceAdjustment(orderId(), line.id, minor);
            if (outcome.decision === 'requires-approval') {
                notice.value = `${sku} added; the price was sent for approval.`;
            }
        } catch (e) {
            const why = e instanceof Error ? e.message : 'the price was not applied';
            notice.value = `${sku} added, but the price was not applied: ${why}`;
        }
    }

    // A refusal stays in the add row; the line is added first, a changed price then goes through the price path.
    async function submit(): Promise<boolean> {
        const chosen = picked.value;
        if (chosen && quote.value && quotedQuantity !== quantity.value) {
            clearTimeout(timer);
            await requote();
        }
        if (multipleError.value) {
            error.value = multipleError.value;
            return false;
        }
        if (!chosen || !quote.value) {
            error.value = error.value || 'Choose a product first';
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
            await applyChangedPrice(chosen.sku);
        });
        if (!failed) cancel();
        return !failed;
    }

    return {
        open,
        query,
        matches,
        picked,
        quote,
        step,
        multipleError,
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
