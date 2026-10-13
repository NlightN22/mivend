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
