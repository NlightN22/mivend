import type { Finding } from '@mivend/plugin-checks';
import type { OrderCheckSubject } from '@mivend/plugin-reservation';

import { organizationRefs, sumStock } from './order-check-data';
import type { OrderCheckData } from './order-check-data';

export const ORGANIZATION_STOCK = 'erp.organization-stock';

export type OrganizationStockReason =
    | 'storage-organizations-short'
    | 'contract-organizations-short';

// ERP-mandated: organizations holding the storage place AND having a customer contract with the
// buyer must together hold the needed quantity (stock summed as is, negatives included).
export function evaluateOrganizationStock(
    subject: OrderCheckSubject,
    data: OrderCheckData,
): Finding[] {
    const { buyerCounterpartyId, warehouseErpId } = subject;
    if (!buyerCounterpartyId || !warehouseErpId) return [];
    const findings: Finding[] = [];
    for (const line of subject.lines) {
        const storage = line.productErpId ? data.storageOrganizations.get(line.productErpId) : null;
        if (!line.productErpId || !storage || storage.length === 0) continue;
        const needed = line.quantity / line.storageUnitRatioToBase;
        const stock = data.stockByProduct.get(line.productErpId);
        const eligible = storage.filter(id => data.contractOrganizations.has(id));
        const available = sumStock(stock, eligible);
        if (needed <= available) continue;
        const storageStock = sumStock(stock, storage);
        const reason: OrganizationStockReason =
            needed > storageStock ? 'storage-organizations-short' : 'contract-organizations-short';
        findings.push({
            severity: 'error',
            lineRef: line.lineId,
            messageKey: `erp.organization-stock.${reason}`,
            facts: {
                reason,
                productErpId: line.productErpId,
                sku: line.sku,
                warehouseErpId,
                needed,
                available,
                storageStock,
                storageOrganizations: organizationRefs(storage, data),
                contractOrganizations: organizationRefs(data.contractOrganizations, data),
                eligibleOrganizations: organizationRefs(eligible, data),
            },
        });
    }
    return findings;
}
