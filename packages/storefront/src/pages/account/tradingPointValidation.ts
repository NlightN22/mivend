import { isCompleteRuPhone, isValidPersonName } from '@mivend/ui-kit';
import type { TradingPointAddForm } from './useTradingPoints';

export type TradingPointErrors = Partial<
    Record<'name' | 'address' | 'contactName' | 'contactPhone', string>
>;

export function tradingPointErrors(form: TradingPointAddForm): TradingPointErrors {
    const errors: TradingPointErrors = {};
    if (!form.name.trim()) errors.name = 'tradingPoints.error.name';
    const address = form.address.trim();
    if (address.length < 10 || !/\d/.test(address)) errors.address = 'tradingPoints.error.address';
    if (form.contactName && !isValidPersonName(form.contactName))
        errors.contactName = 'tradingPoints.error.contactName';
    if (form.contactPhone && !isCompleteRuPhone(form.contactPhone))
        errors.contactPhone = 'tradingPoints.error.phone';
    return errors;
}

export function isTradingPointValid(form: TradingPointAddForm): boolean {
    return Object.keys(tradingPointErrors(form)).length === 0;
}
