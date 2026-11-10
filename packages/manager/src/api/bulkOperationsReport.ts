import type { BulkBatch, BulkBatchItem } from './bulkOperations';

// Reason codes are stable server-side; an unknown code falls back to the raw code.
const REASON_LABELS: Record<string, string> = {
    not_found: 'Record not found',
    out_of_scope: 'Outside your scope',
    already_active: 'Portal access already granted',
    no_portal_access: 'No portal access to revoke',
    inactive: 'Inactive in the ERP',
    no_contact: 'Phone or e-mail is missing',
    no_inn: 'INN is missing in the ERP',
    inn_duplicate: 'INN is used by another counterparty with portal access',
    actor_not_allowed: 'Your access changed before this record was reached',
    error: 'Could not be applied',
};

export function reasonLabel(code: string): string {
    return REASON_LABELS[code] ?? code;
}

// A cell starting with = + - @ (or a control character) would run as a formula in a spreadsheet.
function cell(raw: string): string {
    const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function batchReportCsv(batch: BulkBatch, items: BulkBatchItem[]): string {
    const header = ['Batch', 'Record', 'Name', 'Result', 'Reason', 'Message'];
    const lines = items.map(i =>
        [
            batch.number,
            i.targetId,
            i.label ?? '',
            i.outcome ?? 'pending',
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
