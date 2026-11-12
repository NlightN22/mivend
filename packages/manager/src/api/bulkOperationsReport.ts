import { i18n } from '../i18n';
import type { BulkBatch, BulkBatchItem } from './bulkOperations';

// Reason codes are stable server-side; an unknown code falls back to the raw code.
export function reasonLabel(code: string): string {
    const key = `bulkOperations.reasons.${code}`;
    return i18n.global.te(key) ? i18n.global.t(key) : code;
}

// A cell starting with = + - @ (or a control character) would run as a formula in a spreadsheet.
function cell(raw: string): string {
    const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function batchReportCsv(batch: BulkBatch, items: BulkBatchItem[]): string {
    const header = ['batch', 'record', 'name', 'result', 'reason', 'message'].map(k =>
        i18n.global.t(`bulkOperations.report.${k}`),
    );
    const lines = items.map(i =>
        [
            batch.number,
            i.targetId,
            i.label ?? '',
            i.outcome ?? i18n.global.t('bulkOperations.report.pending'),
            i.reasonCode ? reasonLabel(i.reasonCode) : '',
            i.message ?? '',
        ]
            .map(cell)
            .join(','),
    );
    return [header.join(','), ...lines].join('\n');
}

const BOM = String.fromCharCode(0xfeff);

export function downloadCsv(filename: string, csv: string): void {
    const url = URL.createObjectURL(new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
