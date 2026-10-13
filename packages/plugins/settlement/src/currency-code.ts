// ISO 4217 numeric codes the ERP may send instead of the alphabetic code.
const NUMERIC_TO_ALPHA: Record<string, string> = {
    '643': 'RUB',
    '810': 'RUB',
    '840': 'USD',
    '978': 'EUR',
    '156': 'CNY',
    '398': 'KZT',
    '933': 'BYN',
    '980': 'UAH',
    '417': 'KGS',
    '051': 'AMD',
    '981': 'GEL',
    '860': 'UZS',
    '949': 'TRY',
    '826': 'GBP',
};

export function toAlphaCurrency(code: string): string {
    const trimmed = code.trim();
    if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
    return NUMERIC_TO_ALPHA[trimmed.padStart(3, '0')] ?? trimmed;
}
