import type { ContactPointInput, ContactPointType } from '@mivend/plugin-counterparty';

// The ERP sends its own type names; the keys are those wire values.
const TYPES: Record<string, ContactPointType> = {
    Телефон: 'phone',
    АдресЭлектроннойПочты: 'email',
    Адрес: 'address',
    ВебСтраница: 'web',
};

// undefined = the event carries no list (keep what was derived earlier); [] = an explicitly empty list.
export function parseContactInfos(value: unknown): ContactPointInput[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const rows: ContactPointInput[] = [];
    for (const item of value) {
        if (typeof item !== 'object' || item === null) continue;
        const row = item as Record<string, unknown>;
        if (typeof row.presentation !== 'string') continue;
        rows.push({
            type: TYPES[String(row.type)] ?? 'other',
            value: row.presentation,
            label: typeof row.kindName === 'string' ? row.kindName : null,
            isPrimary: row.isPrimary === true,
            comment: typeof row.comment === 'string' ? row.comment : null,
        });
    }
    return rows;
}
