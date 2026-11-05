import { isValidPersonName } from '@mivend/ui-kit/src/utils/contactFormat';
import { isValidPhone } from '@mivend/ui-kit/src/utils/phoneFormat';
import type { TradingPointAddForm } from './useTradingPoints';

export type TradingPointErrors = Partial<
    Record<'name' | 'address' | 'contactName' | 'contactPhone', string>
>;

// Values that came from the ERP and were not touched stay as they arrived.
export function tradingPointErrors(
    form: TradingPointAddForm,
    original?: TradingPointAddForm,
): TradingPointErrors {
    const errors: TradingPointErrors = {};
    const changed = (key: keyof TradingPointAddForm): boolean => form[key] !== original?.[key];
    if (!form.name.trim()) errors.name = 'tradingPoints.error.name';
    const address = form.address.trim();
    if (changed('address') && (address.length < 10 || !/\d/.test(address)))
        errors.address = 'tradingPoints.error.address';
    if (changed('contactName') && form.contactName && !isValidPersonName(form.contactName))
        errors.contactName = 'tradingPoints.error.contactName';
    if (changed('contactPhone') && form.contactPhone && !isValidPhone(form.contactPhone))
        errors.contactPhone = 'tradingPoints.error.phone';
    return errors;
}

export function isTradingPointValid(
    form: TradingPointAddForm,
    original?: TradingPointAddForm,
): boolean {
    return Object.keys(tradingPointErrors(form, original)).length === 0;
}
