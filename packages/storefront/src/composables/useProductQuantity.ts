import { useCartActions } from './useCartActions';
import { useMultiplicityEnforced } from './useMultiplicityEnforced';
import { usePackagesOnly } from './usePackagesOnly';
import { unitViewOf, type UnitView } from './productQuantity';
import type { ProductItem } from './useProductList';
import { baseToPacks, nextPackAbove, packsToBase, salesUnitOf } from './useSalesUnit';

export function useProductQuantity(): {
    packagesOnly: ReturnType<typeof usePackagesOnly>['packagesOnly'];
    multiplicityEnforced: ReturnType<typeof useMultiplicityEnforced>['multiplicityEnforced'];
    unitView: (p: ProductItem) => UnitView;
    packQty: (p: ProductItem) => number | null;
    shownQty: (p: ProductItem) => number;
    toBaseQty: (p: ProductItem, shown: number) => number;
} {
    const { cartLineFor } = useCartActions();
    const { packagesOnly, load: loadPackagesOnly } = usePackagesOnly();
    const { multiplicityEnforced, load: loadMultiplicityEnforced } = useMultiplicityEnforced();
    void loadPackagesOnly();
    void loadMultiplicityEnforced();

    const unitView = (p: ProductItem): UnitView =>
        unitViewOf(p.variants[0], packagesOnly.value, multiplicityEnforced.value);

    // Pieces in the nearest pack (the variant's own pack unit, else the smallest level above 1).
    function packQty(p: ProductItem): number | null {
        const v = p.variants[0];
        const soldRatio = salesUnitOf(v, packagesOnly.value)?.ratio ?? 1;
        return nextPackAbove(v, v?.packagingLevels ?? [], soldRatio)?.baseQty ?? null;
    }

    function shownQty(p: ProductItem): number {
        const qty = cartLineFor(p.variants[0]?.id)?.quantity ?? 0;
        const unit = salesUnitOf(p.variants[0], packagesOnly.value);
        return unit ? baseToPacks(qty, unit) : qty;
    }

    function toBaseQty(p: ProductItem, shown: number): number {
        const unit = salesUnitOf(p.variants[0], packagesOnly.value);
        return unit ? packsToBase(shown, unit) : shown;
    }

    return { packagesOnly, multiplicityEnforced, unitView, packQty, shownQty, toBaseQty };
}
