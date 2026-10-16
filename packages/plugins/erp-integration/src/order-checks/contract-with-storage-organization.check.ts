import type { Finding } from '@mivend/plugin-checks';
import type { OrderCheckSubject } from '@mivend/plugin-reservation';

import { lineOrganization, organizationBreakdown, organizationRef } from './order-check-data';
import type { OrderCheckData } from './order-check-data';

export const CONTRACT_WITH_STORAGE_ORGANIZATION = 'erp.contract-with-storage-organization';

// ERP-mandated: the buyer needs a customer contract with the one organization that sells the line.
export function evaluateContractWithStorageOrganization(
    subject: OrderCheckSubject,
    data: OrderCheckData,
): Finding[] {
    const { buyerCounterpartyId, warehouseErpId } = subject;
    if (!buyerCounterpartyId || !warehouseErpId) return [];
    const findings: Finding[] = [];
    for (const line of subject.lines) {
        const own = lineOrganization(line, data);
        if (!own || data.contractOrganizations.has(own.organizationId)) continue;
        findings.push({
            severity: 'error',
            lineRef: line.lineId,
            messageKey: 'erp.contract-with-storage-organization.missing',
            facts: {
                reason: 'no-contract-with-line-organization',
                productErpId: own.productErpId,
                sku: line.sku,
                warehouseErpId,
                organization: organizationRef(own.organizationId, data),
                storageOrganizations: organizationBreakdown(own.productErpId, own.storage, data),
            },
        });
    }
    return findings;
}
