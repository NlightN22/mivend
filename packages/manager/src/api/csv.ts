export interface CsvRaw {
    raw: string;
}
export type CsvCell = string | number | null | CsvRaw;

export const csvRaw = (raw: string): CsvRaw => ({ raw });

const BOM = String.fromCharCode(0xfeff);
const SEPARATOR = ';';

// A text cell starting with = + - @ (or a tab/CR) would run as a formula in a spreadsheet.
function text(value: string): string {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function cell(value: CsvCell): string {
    if (value === null) return '';
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' ? text(value) : value.raw;
}

export function buildCsv(header: string[], rows: CsvCell[][]): string {
    const lines = [header, ...rows].map(line => line.map(cell).join(SEPARATOR));
    return `${BOM}${lines.join('\r\n')}\r\n`;
}

export function downloadCsvFile(filename: string, csv: string): void {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
