import {
    AsYouType,
    parsePhoneNumberFromString,
    validatePhoneNumberLength,
} from 'libphonenumber-js/min';

const MAX_DIGITS = 15;
const DEFAULT_COUNTRY = 'RU';

export interface PhoneInputResult {
    value: string;
    caret: number;
}

function digitsOf(text: string): string {
    return text.replace(/\D/g, '');
}

function caretAfterDigits(formatted: string, digitCount: number): number {
    if (digitCount <= 0) return Math.min(1, formatted.length);
    let seen = 0;
    for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) seen++;
        if (seen === digitCount) return i + 1;
    }
    return formatted.length;
}

// A number typed without "+" is a national one: 8 is the trunk prefix, anything else gets +7.
function withDefaultCountry(digits: string): string {
    if (digits.startsWith('8')) return `7${digits.slice(1)}`;
    return digits.startsWith('7') ? digits : `7${digits}`;
}

// Backspace over a mask character removes no digit, so the mask would put it straight back
// and hold-to-delete would stall; drop the digit before the caret instead.
export function applyPhoneInput(
    prev: string,
    raw: string,
    caret: number,
    deleting: boolean,
): PhoneInputResult {
    let digits = digitsOf(raw);
    let digitsLeft = digitsOf(raw.slice(0, caret)).length;
    if (deleting && digits === digitsOf(prev) && digitsLeft > 0) {
        digits = digits.slice(0, digitsLeft - 1) + digits.slice(digitsLeft);
        digitsLeft -= 1;
    }
    const national = !deleting && !raw.includes('+') && digits.length > 0;
    if (national) {
        digits = withDefaultCountry(digits);
        digitsLeft = digits.length;
    }
    digits = digits.slice(0, MAX_DIGITS);
    while (digits.length > 1 && validatePhoneNumberLength(`+${digits}`) === 'TOO_LONG') {
        digits = digits.slice(0, -1);
    }
    if (!digits) {
        const value = !deleting && raw.includes('+') ? '+' : '';
        return { value, caret: value.length };
    }
    const value = new AsYouType().input(`+${digits}`);
    return { value, caret: caretAfterDigits(value, Math.min(digitsLeft, digits.length)) };
}

export function parsePhone(raw: string): ReturnType<typeof parsePhoneNumberFromString> {
    return parsePhoneNumberFromString(raw, DEFAULT_COUNTRY);
}

export function isValidPhone(raw: string): boolean {
    return parsePhone(raw)?.isValid() ?? false;
}
