export interface ParsedProformaNumber {
    documentId: string;
    ordinal: number;
    // null for the pre-version `<order>-<NN>` shape.
    version: number | null;
}

// `<order number>-<NN>-<version>`; the document id is everything before the version.
export function parseProformaNumber(number: string): ParsedProformaNumber | null {
    const match = /^(.+-(\d+))-(\d+)$/.exec(number);
    if (match)
        return { documentId: match[1], ordinal: Number(match[2]), version: Number(match[3]) };
    const legacy = /^(.+-(\d+))$/.exec(number);
    if (!legacy) return null;
    return { documentId: legacy[1], ordinal: Number(legacy[2]), version: null };
}

export function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 86_400_000);
}
