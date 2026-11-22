import type { ContactPointInput, ContactPointType } from '@mivend/plugin-counterparty';

// The ERP sends its own type names; the keys are those wire values.
const TYPES: Record<string, ContactPointType> = {
    Телефон: 'phone',
    АдресЭлектроннойПочты: 'email',
    Адрес: 'address',
    ВебСтраница: 'web',
};

export interface ContactFacts {
    phone: string | null;
    email: string | null;
    // Only when the set has exactly one address: contact kind names are not in the contract, so a legal address cannot be told from an actual one.
    soleAddress: string | null;
}

// Rows of a ContactInfoSet as channels; the kind is an id only, so the label stays empty.
export function contactRowsToInputs(rows: unknown): ContactPointInput[] {
    if (!Array.isArray(rows)) return [];
    const inputs: ContactPointInput[] = [];
    for (const item of rows) {
        if (typeof item !== 'object' || item === null) continue;
        const row = item as Record<string, unknown>;
        if (typeof row.presentation !== 'string') continue;
        const type = (row.type as { name?: unknown } | undefined)?.name;
        inputs.push({
            type: TYPES[String(type)] ?? 'other',
            value: row.presentation,
            label: null,
            isPrimary: row.isDefault === true,
            comment: typeof row.comment === 'string' ? row.comment : null,
        });
    }
    return inputs;
}

function firstOf(inputs: ContactPointInput[], type: ContactPointType): string | null {
    const ofType = inputs.filter(i => i.type === type && i.value.trim() !== '');
    return (ofType.find(i => i.isPrimary) ?? ofType[0])?.value ?? null;
}

export function contactFacts(inputs: ContactPointInput[]): ContactFacts {
    const addresses = inputs.filter(i => i.type === 'address' && i.value.trim() !== '');
    return {
        phone: firstOf(inputs, 'phone'),
        email: firstOf(inputs, 'email'),
        soleAddress: addresses.length === 1 ? addresses[0].value : null,
    };
}
