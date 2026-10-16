import type { Finding } from '@mivend/plugin-checks';
import type { OrderCheckSubject } from '@mivend/plugin-reservation';

import {
    lineOrganization,
    organizationBreakdown,
    organizationRef,
    stockOf,
} from './order-check-data';
import type { OrderCheckData } from './order-check-data';

export const ORGANIZATION_STOCK = 'erp.organization-stock';

// ERP-mandated: the organization that sells the line must hold the needed quantity itself
// (stock as is, negatives included; other organizations' stock never covers it).
export function evaluateOrganizationStock(
    subject: OrderCheckSubject,
    data: OrderCheckData,
): Finding[] {
    const { buyerCounterpartyId, warehouseErpId } = subject;
    if (!buyerCounterpartyId || !warehouseErpId) return [];
    const findings: Finding[] = [];
    for (const line of subject.lines) {
        const own = lineOrganization(line, data);
        if (!own) continue;
        const needed = line.quantity / line.storageUnitRatioToBase;
        const available = stockOf(data, own.productErpId, own.organizationId);
        if (needed <= available) continue;
        findings.push({
            severity: 'error',
            lineRef: line.lineId,
            messageKey: 'erp.organization-stock.short',
            facts: {
                reason: 'line-organization-stock-short',
                productErpId: own.productErpId,
                sku: line.sku,
                warehouseErpId,
                organization: organizationRef(own.organizationId, data),
                needed,
                available,
                storageOrganizations: organizationBreakdown(own.productErpId, own.storage, data),
            },
        });
    }
    return findings;
}
