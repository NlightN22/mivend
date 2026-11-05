import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export interface ContactInput {
    name: string;
    address: string;
    contactName?: string | null;
    contactPhone?: string | null;
}

export function normalizePhone(raw: string): string | null {
    const parsed = parsePhoneNumberFromString(raw, 'RU');
    return parsed?.isValid() ? parsed.formatInternational() : null;
}

export function isValidPersonName(raw: string): boolean {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.every(w => /\p{L}{2,}|^\p{L}\.$/u.test(w));
}

export function isValidAddress(raw: string): boolean {
    const v = raw.trim();
    return v.length >= 10 && /\d/.test(v) && /\p{L}/u.test(v);
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
