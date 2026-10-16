import { describe, expect, it } from 'vitest';

import type { OrderCheckSubject } from '../../order-check-subject';
import { evaluateExportDataMissing } from '../../order-export-data.check';

const subject = (over: Partial<OrderCheckSubject> = {}): OrderCheckSubject => ({
    orderId: '1',
    orderCode: '100-1',
    customerId: '1',
    branchId: 'branch-1',
    buyerCounterpartyId: 'cp-1',
    warehouseErpId: 'w-1',
    lines: [
        {
            lineId: '10',
            productVariantId: '1',
            sku: 'A',
            productErpId: 'p-1',
            organizationErpId: 'o-1',
            quantity: 1,
            storageUnitRatioToBase: 1,
        },
    ],
    ...over,
});

describe('evaluateExportDataMissing', () => {
    it('passes an order with the buyer, every product and the warehouse known', () => {
        expect(evaluateExportDataMissing(subject())).toEqual([]);
    });

    it('reports a buyer without a counterparty, a product without an ERP id and a missing warehouse', () => {
        const base = subject();
        const findings = evaluateExportDataMissing(
            subject({
                buyerCounterpartyId: null,
                warehouseErpId: null,
                lines: [{ ...base.lines[0], productErpId: null }],
            }),
        );
        expect(findings.map(f => f.messageKey)).toEqual([
            'erp.export-data-missing.customer',
            'erp.export-data-missing.product',
            'erp.export-data-missing.warehouse',
        ]);
        expect(findings[1]).toMatchObject({ lineRef: '10', facts: { sku: 'A' } });
    });

    it('does not ask for a warehouse of an order without lines or before it has a branch', () => {
        expect(evaluateExportDataMissing(subject({ lines: [], warehouseErpId: null }))).toEqual([]);
        expect(
            evaluateExportDataMissing(subject({ branchId: null, warehouseErpId: null })),
        ).toEqual([]);
    });
});
