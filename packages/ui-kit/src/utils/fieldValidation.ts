import {
    isValidAddress,
    isValidEmail,
    isValidPersonName,
    isValidPhone,
    isValidWorkingHours,
} from 'shared/src/field-validation';

export {
    ADDRESS_MIN_LENGTH,
    EMAIL_MAX_LENGTH,
    WORKING_HOURS_MAX_LENGTH,
    datePeriodError,
    isValidAddress,
    isValidEmail,
    isValidIsoDate,
    isValidPersonName,
    isValidPhone,
    isValidWorkingHours,
} from 'shared/src/field-validation';
export type { DatePeriodError } from 'shared/src/field-validation';

export function formatEmail(raw: string): string {
    return raw.replace(/\s+/g, '');
}

export type TradingPointFieldKey =
    | 'name'
    | 'address'
    | 'contactName'
    | 'contactPhone'
    | 'workingHours'
    | 'location';

export interface TradingPointFieldValues {
    name: string;
    address: string;
    contactName: string;
    contactPhone: string;
    workingHours: string;
    latitude: number | null;
    longitude: number | null;
}

// Values that came from the ERP and were not touched stay as they arrived.
export function tradingPointFieldErrors(
    form: TradingPointFieldValues,
    original?: TradingPointFieldValues,
): Partial<Record<TradingPointFieldKey, true>> {
    const errors: Partial<Record<TradingPointFieldKey, true>> = {};
    const changed = (key: keyof TradingPointFieldValues): boolean => form[key] !== original?.[key];
    if (!form.name.trim()) errors.name = true;
    if (changed('address') && !isValidAddress(form.address)) errors.address = true;
    if (changed('contactName') && form.contactName && !isValidPersonName(form.contactName))
        errors.contactName = true;
    if (changed('contactPhone') && form.contactPhone && !isValidPhone(form.contactPhone))
        errors.contactPhone = true;
    if (changed('workingHours') && form.workingHours && !isValidWorkingHours(form.workingHours))
        errors.workingHours = true;
    if (form.latitude === null || form.longitude === null) errors.location = true;
    return errors;
}

export interface ContactRowValues {
    name: string;
    phone: string;
    email: string;
}

export function contactRowErrors(
    row: ContactRowValues,
    original?: ContactRowValues,
): Partial<Record<keyof ContactRowValues, true>> {
    const errors: Partial<Record<keyof ContactRowValues, true>> = {};
    if (!row.name.trim()) errors.name = true;
    else if (row.name !== original?.name && !isValidPersonName(row.name)) errors.name = true;
    if (row.phone !== original?.phone && row.phone && !isValidPhone(row.phone)) errors.phone = true;
    if (row.email !== original?.email && row.email && !isValidEmail(row.email)) errors.email = true;
    return errors;
}
