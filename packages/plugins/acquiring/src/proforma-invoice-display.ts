import type { SelectQueryBuilder } from 'typeorm';

import type { ProformaInvoice, ProformaInvoiceStatus } from './entities/proforma-invoice.entity';

// User-facing status: a proforma invoice is informational, "paid" is shown at order level instead.
export type ProformaInvoiceDisplayStatus = 'current' | 'superseded' | 'cancelled';

export function displayStatusOf(status: ProformaInvoiceStatus): ProformaInvoiceDisplayStatus {
    if (status === 'cancelled' || status === 'superseded') return status;
    return 'current';
}

const CURRENT_STORED: ProformaInvoiceStatus[] = ['pending', 'issued', 'paid'];

// `current` filters by the display status; any other value is the stored status.
export function applyStatusFilter(
    qb: SelectQueryBuilder<ProformaInvoice>,
    alias: string,
    status: string,
): void {
    if (status === 'current') {
        qb.andWhere(`${alias}.status IN (:...currentStatuses)`, {
            currentStatuses: CURRENT_STORED,
        });
    } else {
        qb.andWhere(`${alias}.status = :status`, { status });
    }
}
