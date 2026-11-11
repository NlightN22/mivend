export const KNOWN_CATEGORIES = [
    'sale',
    'payment',
    'return',
    'correction',
    'bonus',
    'other',
] as const;

export type SettlementCategory = (typeof KNOWN_CATEGORIES)[number];

// The ERP owns the category set; a value we do not know is shown under "other".
export function normalizeCategory(raw: string | null | undefined): SettlementCategory {
    return (KNOWN_CATEGORIES as readonly string[]).includes(raw ?? '')
        ? (raw as SettlementCategory)
        : 'other';
}

export const CATEGORY_SQL = `(CASE WHEN t.category IN (${KNOWN_CATEGORIES.map(c => `'${c}'`).join(', ')})
    THEN t.category ELSE 'other' END)`;

// Purchases and payroll are not customer-facing whatever the reference's visibility flag says.
export const INTERNAL_CATEGORIES = ['supplier', 'payroll'] as const;

const INTERNAL_LIST = INTERNAL_CATEGORIES.map(c => `'${c}'`).join(', ');

// Customer rule: hidden only when explicitly not posted in accounting or in an internal category.
export const customerVisibleSql = (doc: string, type: string): string => `(
    COALESCE("${type}"."category", 'other') NOT IN (${INTERNAL_LIST})
    AND COALESCE("${doc}"."accounting"->>'reflectedInAccounting', 'true') <> 'false')`;

export const customerHiddenSql = (doc: string, type: string): string =>
    `(NOT ${customerVisibleSql(doc, type)})`;
