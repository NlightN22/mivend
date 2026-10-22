import { i18n } from '../i18n';

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

export function discountTierRemaining(remaining: string, percent: number): string {
    return t('discount.tierRemaining', { remaining, percent });
}

export function discountTierCurrentSuffix(percent: number): string {
    return t('discount.tierCurrent', { percent });
}

export function stockInsufficient(qty: number): string {
    return t('cartErrors.stockInsufficient', { n: qty });
}
