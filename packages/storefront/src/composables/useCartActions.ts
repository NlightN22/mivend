import { toast } from '@mivend/ui-kit';
import { useCartStore, type CartLine } from '../stores/cart';
import { discountAddToCartHint } from '../utils/discountMessages';
import { resolveAddQty, type QuantityVariant } from './productQuantity';
import { useMultiplicityEnforced } from './useMultiplicityEnforced';
import { usePackagesOnly } from './usePackagesOnly';

export function useCartActions(): {
    cartLineFor: (variantId: string | undefined) => CartLine | null;
    addToCart: (
        variantId: string,
        variant: QuantityVariant | null | undefined,
        baseQty?: number,
    ) => Promise<{ brand: string; percent: number } | null>;
    onAddToCart: (
        variantId: string | undefined,
        variant: QuantityVariant | null | undefined,
        baseQty?: number,
    ) => Promise<void>;
    onUpdateQty: (lineId: string, qty: number) => Promise<void>;
} {
    const cartStore = useCartStore();
    const { packagesOnly, load: loadPackagesOnly } = usePackagesOnly();
    const { multiplicityEnforced, load: loadMultiplicityEnforced } = useMultiplicityEnforced();

    function cartLineFor(variantId: string | undefined): CartLine | null {
        if (!variantId) return null;
        // Exclude optimistic temp lines — they have no valid server lineId yet
        const line = cartStore.lines.find(l => l.productVariant.id === variantId) ?? null;
        if (line?.id.startsWith('optimistic-')) return null;
        return line;
    }

    // The only path into cartStore.addItem: the quantity always honours the pack/multiplicity rule.
    async function addToCart(
        variantId: string,
        variant: QuantityVariant | null | undefined,
        baseQty?: number,
    ): Promise<{ brand: string; percent: number } | null> {
        await Promise.all([loadPackagesOnly(), loadMultiplicityEnforced()]);
        const qty = resolveAddQty(variant, packagesOnly.value, multiplicityEnforced.value, baseQty);
        return cartStore.addItem(variantId, qty);
    }

    async function onAddToCart(
        variantId: string | undefined,
        variant: QuantityVariant | null | undefined,
        baseQty?: number,
    ): Promise<void> {
        if (!variantId) return;
        // The mutation response carries the discount: the catalog price is wrong once an add crosses a tier.
        const discount = await addToCart(variantId, variant, baseQty);
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

    return { cartLineFor, addToCart, onAddToCart, onUpdateQty };
}
