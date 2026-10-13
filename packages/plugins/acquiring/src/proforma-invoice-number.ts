export interface ParsedProformaNumber {
    documentId: string;
    ordinal: number;
    version: number;
}

// `<order number>-<NN>-<version>`; the document id is everything before the version.
export function parseProformaNumber(number: string): ParsedProformaNumber | null {
    const match = /^(.+-(\d+))-(\d+)$/.exec(number);
    if (!match) return null;
    return { documentId: match[1], ordinal: Number(match[2]), version: Number(match[3]) };
}

export function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 86_400_000);
}
