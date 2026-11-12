import { tradingPointFieldErrors } from '@mivend/ui-kit';
import type { TradingPointAddForm } from './useTradingPoints';

export type TradingPointErrors = Partial<
    Record<'name' | 'address' | 'contactName' | 'contactPhone' | 'location', string>
>;

const MESSAGE_KEYS = {
    name: 'tradingPoints.error.name',
    address: 'tradingPoints.error.address',
    contactName: 'tradingPoints.error.contactName',
    contactPhone: 'tradingPoints.error.phone',
    location: 'tradingPoints.error.location',
} as const;

// Working hours are not checked here: the storefront has no message for them yet.
export function tradingPointErrors(
    form: TradingPointAddForm,
    original?: TradingPointAddForm,
): TradingPointErrors {
    const found = tradingPointFieldErrors(form, original);
    const errors: TradingPointErrors = {};
    for (const key of Object.keys(MESSAGE_KEYS) as Array<keyof typeof MESSAGE_KEYS>) {
        if (found[key]) errors[key] = MESSAGE_KEYS[key];
    }
    return errors;
}

export function isTradingPointValid(
    form: TradingPointAddForm,
    original?: TradingPointAddForm,
): boolean {
    return Object.keys(tradingPointErrors(form, original)).length === 0;
}
