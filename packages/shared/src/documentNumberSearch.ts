// Undoes formatDocumentNumber's display-only leading dash if a pasted search term carries it —
// never an Invoice `-NN` suffix, which is a real part of the stored number, not cosmetic.
export function documentNumberSearchTerm(search: string): string {
    return `%${search.replace(/^(\d{3})-/, '$1')}%`;
}
