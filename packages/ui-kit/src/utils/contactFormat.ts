const NATIONAL_DIGITS = 10;

export function nationalPhoneDigits(raw: string): string {
    let digits = raw.replace(/\D/g, '');
    if (digits.length > 0 && (digits[0] === '7' || digits[0] === '8')) digits = digits.slice(1);
    return digits.slice(0, NATIONAL_DIGITS);
}

export function formatNationalPhone(d: string): string {
    if (!d) return '';
    let out = `+7 (${d.slice(0, 3)}`;
    if (d.length >= 3) out += ')';
    if (d.length > 3) out += ` ${d.slice(3, 6)}`;
    if (d.length > 6) out += `-${d.slice(6, 8)}`;
    if (d.length > 8) out += `-${d.slice(8, 10)}`;
    return out;
}

export function formatRuPhone(raw: string): string {
    return formatNationalPhone(nationalPhoneDigits(raw));
}

export function isCompleteRuPhone(raw: string): boolean {
    return nationalPhoneDigits(raw).length === NATIONAL_DIGITS;
}

export function digitsBeforeCaret(value: string, caret: number): number {
    return nationalPhoneDigits(value.slice(0, caret)).length;
}

export function caretAfterDigits(formatted: string, digitCount: number): number {
    if (digitCount <= 0)
        return formatted.length <= 2 ? formatted.length : formatted.indexOf('(') + 1;
    let seen = 0;
    for (let i = 4; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) seen++;
        if (seen === digitCount) return i + 1;
    }
    return formatted.length;
}

export interface PhoneInputResult {
    value: string;
    caret: number;
}

// Backspace over a mask character removes no digit, so the mask would put it straight back
// and hold-to-delete would stall; drop the digit before the caret instead.
export function applyPhoneInput(prev: string, raw: string, caret: number): PhoneInputResult {
    const deleting = raw.length < prev.length;
    let digits = nationalPhoneDigits(raw);
    let digitsLeft = digitsBeforeCaret(raw, caret);
    if (deleting && digits === nationalPhoneDigits(prev) && digitsLeft > 0) {
        digits = digits.slice(0, digitsLeft - 1) + digits.slice(digitsLeft);
        digitsLeft -= 1;
    }
    while (digits.startsWith('7')) {
        digits = digits.slice(1);
        digitsLeft = Math.max(0, digitsLeft - 1);
    }
    if (!digits) {
        const value = !deleting && /[+78]/.test(raw) ? '+7' : '';
        return { value, caret: value.length };
    }
    const value = formatNationalPhone(digits);
    return { value, caret: caretAfterDigits(value, digitsLeft) };
}

const NAME_ALLOWED = /[^\p{L}\s'’.-]/gu;

function capitalizeWord(word: string): string {
    return word.replace(
        /(^|[-'’])(\p{L})(\p{L}*)/gu,
        (_m, sep: string, first: string, rest: string) =>
            sep + first.toUpperCase() + rest.toLowerCase(),
    );
}

export function formatPersonName(raw: string): string {
    return raw
        .replace(NAME_ALLOWED, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s+/, '')
        .split(' ')
        .map(capitalizeWord)
        .join(' ');
}

export function applyNameInput(raw: string, caret: number): PhoneInputResult {
    return { value: formatPersonName(raw), caret: formatPersonName(raw.slice(0, caret)).length };
}

export function isValidPersonName(raw: string): boolean {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.every(w => /\p{L}{2,}|^\p{L}\.$/u.test(w));
}
