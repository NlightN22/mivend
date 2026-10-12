// Undoes formatDocumentNumber's display-only leading dash if a pasted search term carries it —
// never an ProformaInvoice `-NN` suffix, which is a real part of the stored number, not cosmetic.
export function documentNumberSearchTerm(search: string): string {
    return `%${search.replace(/^(\d{3})-/, '$1')}%`;
}

// Maps the displayed form ("001-234-01") to the stored one ("001234-01"); stored values pass through.
export function normalizeDocumentNumber(value: string): string {
    return value.replace(/^(\d{3})-(?=\d)/, '$1');
}
