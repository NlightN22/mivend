const NATIONAL_DIGITS = 10;

export function nationalPhoneDigits(raw: string): string {
    let digits = raw.replace(/\D/g, '');
    if (digits.length > 0 && (digits[0] === '7' || digits[0] === '8')) digits = digits.slice(1);
    return digits.slice(0, NATIONAL_DIGITS);
}

export function formatRuPhone(raw: string): string {
    const d = nationalPhoneDigits(raw);
    if (!d) return '';
    let out = `+7 (${d.slice(0, 3)}`;
    if (d.length >= 3) out += ')';
    if (d.length > 3) out += ` ${d.slice(3, 6)}`;
    if (d.length > 6) out += `-${d.slice(6, 8)}`;
    if (d.length > 8) out += `-${d.slice(8, 10)}`;
    return out;
}

export function isCompleteRuPhone(raw: string): boolean {
    return nationalPhoneDigits(raw).length === NATIONAL_DIGITS;
}

export function digitsBeforeCaret(value: string, caret: number): number {
    return nationalPhoneDigits(value.slice(0, caret)).length;
}

export function caretAfterDigits(formatted: string, digitCount: number): number {
    if (digitCount <= 0) return formatted.indexOf('(') + 1;
    let seen = 0;
    for (let i = 4; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) seen++;
        if (seen === digitCount) return i + 1;
    }
    return formatted.length;
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

export function isValidPersonName(raw: string): boolean {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.every(w => /\p{L}{2,}|^\p{L}\.$/u.test(w));
}
