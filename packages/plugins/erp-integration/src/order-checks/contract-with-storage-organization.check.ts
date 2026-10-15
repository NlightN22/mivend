import type { Finding } from '@mivend/plugin-checks';
import type { OrderCheckSubject } from '@mivend/plugin-reservation';

import { organizationRefs } from './order-check-data';
import type { OrderCheckData } from './order-check-data';

export const CONTRACT_WITH_STORAGE_ORGANIZATION = 'erp.contract-with-storage-organization';

// ERP-mandated: the buyer needs a customer contract with an organization that holds the storage place.
export function evaluateContractWithStorageOrganization(
    subject: OrderCheckSubject,
    data: OrderCheckData,
): Finding[] {
    const { buyerCounterpartyId, warehouseErpId } = subject;
    if (!buyerCounterpartyId || !warehouseErpId) return [];
    const findings: Finding[] = [];
    for (const line of subject.lines) {
        const storage = line.productErpId ? data.storageOrganizations.get(line.productErpId) : null;
        // No known storage organization is "unknown", never a finding.
        if (!line.productErpId || !storage || storage.length === 0) continue;
        if (storage.some(id => data.contractOrganizations.has(id))) continue;
        findings.push({
            severity: 'error',
            lineRef: line.lineId,
            messageKey: 'erp.contract-with-storage-organization.missing',
            facts: {
                reason: 'no-contract-with-storage-organization',
                productErpId: line.productErpId,
                sku: line.sku,
                warehouseErpId,
                storageOrganizations: organizationRefs(storage, data),
                contractOrganizations: organizationRefs(data.contractOrganizations, data),
            },
        });
    }
    return findings;
}
