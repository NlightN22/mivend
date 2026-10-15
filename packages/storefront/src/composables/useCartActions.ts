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
        // Show the discount from the mutation response: the catalog price is wrong once this add
        // crosses into or out of a weight/amount tier.
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
