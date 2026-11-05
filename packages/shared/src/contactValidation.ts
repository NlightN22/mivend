export interface ContactInput {
    name: string;
    address: string;
    contactName?: string | null;
    contactPhone?: string | null;
}

export function normalizeRuPhone(raw: string): string | null {
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) digits = digits.slice(1);
    return digits.length === 10
        ? `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`
        : null;
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
        !normalizeRuPhone(input.contactPhone)
    )
        return 'contact phone must be a complete +7 number';
    return null;
}
