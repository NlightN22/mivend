import { toast } from '@mivend/ui-kit';
import { useCartStore, type CartLine } from '../stores/cart';
import { discountAddToCartHint } from '../utils/discountMessages';

export function useCartActions(): {
    cartLineFor: (variantId: string | undefined) => CartLine | null;
    onAddToCart: (variantId: string | undefined, qty?: number) => Promise<void>;
    onUpdateQty: (lineId: string, qty: number) => Promise<void>;
} {
    const cartStore = useCartStore();

    function cartLineFor(variantId: string | undefined): CartLine | null {
        if (!variantId) return null;
        // Exclude optimistic temp lines — they have no valid server lineId yet
        const line = cartStore.lines.find(l => l.productVariant.id === variantId) ?? null;
        if (line?.id.startsWith('optimistic-')) return null;
        return line;
    }

    async function onAddToCart(variantId: string | undefined, qty = 1): Promise<void> {
        if (!variantId) return;
        // Toast reflects the *actual* applied discount (from the mutation response),
        // not a catalog-level guess — the real price can differ once a weight/amount
        // tier this add crosses (or falls out of) is accounted for.
        const discount = await cartStore.addItem(variantId, qty);
        if (discount) {
            toast(discountAddToCartHint(discount.percent, discount.brand), 'success');
        }
    }

    async function onUpdateQty(lineId: string, qty: number): Promise<void> {
        if (qty === 0) {
            await cartStore.removeItem(lineId);
        } else {
            await cartStore.adjustItem(lineId, qty);
        }
    }

    return { cartLineFor, onAddToCart, onUpdateQty };
}
