import { buildCsv, csvRaw, type CsvCell } from '../../api/csv';

export interface ExportColumn {
    field: string;
    header: string;
}

// A bucket start is an instant at local midnight; the file carries its calendar day in the report's zone.
export function periodDay(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
}

// Amounts stay exact decimal strings with a dot, the period is a calendar day, counts are numbers.
export function exportCsv(
    columns: ExportColumn[],
    rows: Array<{ [key: string]: unknown }>,
    decimalFields: Set<string>,
    notes: string[] = [],
    timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
    const cellOf = (row: { [key: string]: unknown }, field: string): CsvCell => {
        const value = row[field];
        if (value === null || value === undefined) return null;
        if (decimalFields.has(field)) return value === '' ? null : csvRaw(String(value));
        if (field === 'period' && typeof value === 'string' && value !== '') {
            return periodDay(value, timeZone);
        }
        return typeof value === 'number' ? value : String(value);
    };
    const body = rows.map(row => columns.map(c => cellOf(row, c.field)));
    const width = columns.length;
    const noteRows = notes.map(note => [
        note,
        ...Array<CsvCell>(Math.max(width - 1, 0)).fill(null),
    ]);
    return buildCsv(
        columns.map(c => c.header),
        [...body, ...noteRows],
    );
}

export function exportFileName(report: string, from: string, to: string): string {
    return `${report}-${from}_${to}.csv`;
}
