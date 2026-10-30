import { i18n } from '../i18n';
import { baseToPacks, type SalesUnitView } from '../composables/useSalesUnit';

const { t } = i18n.global;

export function discountAddToCartHint(percent: number, brand: string): string {
    return t('discount.addHint', { percent, brand });
}

export function discountLineReason(brand: string, percent: number): string {
    return t('discount.lineReason', { brand, percent });
}

export function discountTierReachedReason(brand: string, value: string, percent: number): string {
    return t('discount.tierReached', { brand, value, percent });
}

export function discountTierComplete(percent: number): string {
    return t('discount.tierComplete', { percent });
}

export function discountTierProgress(current: string, next: string, percent: number): string {
    return t('discount.tierProgress', { current, next, percent });
}

export function discountTierCurrentSuffix(percent: number): string {
    return t('discount.tierCurrent', { percent });
}

// quantityAvailable is in base units; a line sold in packs reports whole packs in the pack unit.
export function stockInsufficient(qty: number, unit: SalesUnitView | null = null): string {
    if (!unit) return t('cartErrors.stockInsufficient', { n: qty });
    const packs = Math.floor(baseToPacks(qty, unit) / unit.packStep + 1e-9) * unit.packStep;
    return packs > 0
        ? t('cartErrors.stockInsufficientPacks', { n: packs, unit: unit.name })
        : t('cartErrors.stockNoWholePacks', { unit: unit.name });
}
