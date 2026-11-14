import { isValidAddress, isValidPersonName, normalizePhone } from './field-validation';

export interface ContactInput {
    name: string;
    address: string;
    contactName?: string | null;
    contactPhone?: string | null;
}

export type ContactField = 'address' | 'contactName' | 'contactPhone';

export function validateTradingPointContact(
    input: ContactInput,
    unchanged: readonly ContactField[] = [],
): string | null {
    if (!input.name.trim()) return 'name is required';
    if (!unchanged.includes('address') && !isValidAddress(input.address))
        return 'address must include a street and a house number';
    if (
        !unchanged.includes('contactName') &&
        input.contactName &&
        !isValidPersonName(input.contactName)
    )
        return 'contact name must be a full name';
    if (
        !unchanged.includes('contactPhone') &&
        input.contactPhone &&
        !normalizePhone(input.contactPhone)
    )
        return 'contact phone must be a full number with the country code';
    return null;
}
