import { toast } from '@mivend/ui-kit';
import { useCartStore } from '../stores/cart';

export interface DiscountHint {
    brand: string;
    percent: number;
}

export function useCartActions() {
    const cartStore = useCartStore();

    function cartLineFor(variantId: string | undefined) {
        if (!variantId) return null;
        // Exclude optimistic temp lines — they have no valid server lineId yet
        const line = cartStore.lines.find(l => l.productVariant.id === variantId) ?? null;
        if (line?.id.startsWith('optimistic-')) return null;
        return line;
    }

    async function onAddToCart(
        variantId: string | undefined,
        qty = 1,
        discountHint?: DiscountHint,
    ): Promise<void> {
        if (!variantId) return;
        await cartStore.addItem(variantId, qty);
        if (discountHint) {
            toast(`Скидка ${discountHint.percent}% на бренд ${discountHint.brand}`, 'success');
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
