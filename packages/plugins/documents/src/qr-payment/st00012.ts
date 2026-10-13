// GOST R 56042-2014: "ST0001" + encoding digit (2 = UTF-8). Spec reference: docs/payments.md.
export interface PaymentQrInput {
    name: string;
    personalAcc: string;
    bankName: string;
    bic: string;
    correspAcc: string;
    sumKopecks: number;
    purpose: string;
    payeeInn: string;
    kpp: string | null;
}

export type PaymentQrResult = { ok: true; payload: string } | { ok: false; errors: string[] };

const PREFIX = 'ST00012';
const MAX_PAYLOAD_LENGTH = 300;

export function sanitizeQrValue(value: string): string {
    return value
        .replace(/[|\p{Cc}]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const BANK_NAME_MAX = 45;

// A long bank name is shortened (the BIC identifies the bank) instead of dropping the whole QR.
export function truncateAtWord(value: string, max: number): string {
    if (value.length <= max) return value;
    const cut = value.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

interface FieldRule {
    key: string;
    label: string;
    value: string;
    max?: number;
    pattern?: RegExp;
}

function fieldRules(input: PaymentQrInput): FieldRule[] {
    return [
        { key: 'Name', label: 'name', value: sanitizeQrValue(input.name), max: 160 },
        {
            key: 'PersonalAcc',
            label: 'personalAcc',
            value: sanitizeQrValue(input.personalAcc),
            pattern: /^\d{20}$/,
        },
        {
            key: 'BankName',
            label: 'bankName',
            value: truncateAtWord(sanitizeQrValue(input.bankName), BANK_NAME_MAX),
            max: BANK_NAME_MAX,
        },
        { key: 'BIC', label: 'bic', value: sanitizeQrValue(input.bic), pattern: /^\d{9}$/ },
        {
            key: 'CorrespAcc',
            label: 'correspAcc',
            value: sanitizeQrValue(input.correspAcc),
            pattern: /^\d{20}$/,
        },
        { key: 'Purpose', label: 'purpose', value: sanitizeQrValue(input.purpose), max: 210 },
        {
            key: 'PayeeINN',
            label: 'payeeInn',
            value: sanitizeQrValue(input.payeeInn),
            pattern: /^(\d{10}|\d{12})$/,
        },
    ];
}

function checkRule(rule: FieldRule): string | null {
    if (!rule.value) return `${rule.label}: missing`;
    if (rule.max && rule.value.length > rule.max) return `${rule.label}: longer than ${rule.max}`;
    if (rule.pattern && !rule.pattern.test(rule.value)) return `${rule.label}: invalid format`;
    return null;
}

// Stricter than the standard: Sum, Purpose and PayeeINN are required here; KPP only when present.
export function buildPaymentQrPayload(input: PaymentQrInput): PaymentQrResult {
    const rules = fieldRules(input);
    const errors = rules.map(checkRule).filter((e): e is string => e !== null);
    if (!Number.isSafeInteger(input.sumKopecks) || input.sumKopecks <= 0) {
        errors.push('sumKopecks: must be a positive integer');
    }
    const kpp = input.kpp ? sanitizeQrValue(input.kpp) : '';
    if (kpp && !/^\d{9}$/.test(kpp)) errors.push('kpp: invalid format');
    if (errors.length > 0) return { ok: false, errors };

    const byKey = new Map(rules.map(r => [r.key, r.value]));
    const parts = [
        PREFIX,
        ...['Name', 'PersonalAcc', 'BankName', 'BIC', 'CorrespAcc'].map(
            k => `${k}=${byKey.get(k)}`,
        ),
        `Sum=${input.sumKopecks}`,
        `Purpose=${byKey.get('Purpose')}`,
        `PayeeINN=${byKey.get('PayeeINN')}`,
        ...(kpp ? [`KPP=${kpp}`] : []),
    ];
    const payload = parts.join('|');
    if (payload.length > MAX_PAYLOAD_LENGTH) {
        return { ok: false, errors: [`payload: longer than ${MAX_PAYLOAD_LENGTH}`] };
    }
    return { ok: true, payload };
}
