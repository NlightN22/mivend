// Minimal client-side CSV export — no server round-trip, the page already has the data loaded.
function escapeCell(value: unknown): string {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
    const lines = [headers, ...rows].map(row => row.map(escapeCell).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
