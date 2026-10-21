// Amounts travel as GraphQL Int kopecks, so this is the largest amount the API accepts.
export const MAX_AMOUNT_MINOR = 2147483647;

export type AmountParse =
    | { kind: 'empty' }
    | { kind: 'invalid' }
    | { kind: 'tooLarge' }
    | { kind: 'ok'; minor: number };

const TWO_DIGITS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export function formatAmountInput(minor: number, locale: string): string {
    return new Intl.NumberFormat(locale, TWO_DIGITS).format(minor / 100);
}

function decimalSeparator(locale: string): string {
    const part = new Intl.NumberFormat(locale).formatToParts(1.5).find(p => p.type === 'decimal');
    return part?.value ?? '.';
}

// A lone other separator followed by 1-2 digits ("60000.5" in ru) is read as the decimal point too.
function normalize(text: string, locale: string): string {
    const compact = text.replace(/[\s\u00a0\u202f]/g, '');
    const decimal = decimalSeparator(locale);
    const other = decimal === ',' ? '.' : ',';
    if (!compact.includes(decimal) && /^\d+[.,]\d{1,2}$/.test(compact)) {
        return compact.replace(other, '.');
    }
    const [whole, ...fraction] = compact.split(decimal);
    const digits = whole.split(other).join('');
    return fraction.length ? `${digits}.${fraction.join(decimal)}` : digits;
}

export function parseAmountInput(text: string, locale: string): AmountParse {
    if (!text.trim()) return { kind: 'empty' };
    const normalized = normalize(text, locale);
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return { kind: 'invalid' };
    const minor = Math.round(Number(normalized) * 100);
    if (minor <= 0) return { kind: 'invalid' };
    if (minor > MAX_AMOUNT_MINOR) return { kind: 'tooLarge' };
    return { kind: 'ok', minor };
}
