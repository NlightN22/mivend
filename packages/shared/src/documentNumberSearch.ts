// Undoes the display-only dash after the first three digits ("100-0000303-01-2" -> "1000000303-01-2").
// A dash followed by fewer than three digits is a real separator of `<order>-<NN>-<version>` and stays.
export function documentNumberSearchTerm(search: string): string {
    return `%${normalizeDocumentNumber(search)}%`;
}

// Maps the displayed form to the stored one; stored values pass through.
export function normalizeDocumentNumber(value: string): string {
    return value.replace(/^(\d{3})-(?=\d{3})/, '$1');
}
