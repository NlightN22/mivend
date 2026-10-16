import type { Finding } from '@mivend/plugin-checks';

import type { OrderCheckSubject } from './order-check-subject';

export const ERP_EXPORT_DATA_MISSING = 'erp.export-data-missing';

// What the ERP order event needs besides the contract and the organization (own checks): the buyer's
// ERP id, each product's ERP id, and the warehouse. Unknown data is never a false positive.
export function evaluateExportDataMissing(subject: OrderCheckSubject): Finding[] {
    const findings: Finding[] = [];
    if (!subject.buyerCounterpartyId) {
        findings.push({
            severity: 'error',
            messageKey: 'erp.export-data-missing.customer',
            facts: { reason: 'buyer-without-counterparty' },
        });
    }
    for (const line of subject.lines) {
        if (line.productErpId) continue;
        findings.push({
            severity: 'error',
            lineRef: line.lineId,
            messageKey: 'erp.export-data-missing.product',
            facts: { reason: 'product-without-erp-id', sku: line.sku },
        });
    }
    if (subject.lines.length > 0 && !subject.warehouseErpId) {
        findings.push({
            severity: 'error',
            messageKey: 'erp.export-data-missing.warehouse',
            facts: { reason: 'no-erp-warehouse' },
        });
    }
    return findings;
}
