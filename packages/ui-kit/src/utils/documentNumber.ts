// Display-only: inserts a dash after the 3-digit instance code (docs/identifiers.md) for
// readability. Never reformat before sending a value back to the server or a search box.
export function formatDocumentNumber(code: string | null | undefined): string {
    if (!code) return '';
    const match = /^(\d{3})(\d+)((?:-\d+)*)$/.exec(code);
    return match ? `${match[1]}-${match[2]}${match[3]}` : code;
}
