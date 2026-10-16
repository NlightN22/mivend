import { describe, expect, it } from 'vitest';

import {
    evaluateContractUnresolved,
    evaluateLinesWithoutOrganization,
} from '../../order-data-checks';

describe('evaluateLinesWithoutOrganization', () => {
    it('reports every line without an organization with its SKU', () => {
        expect(
            evaluateLinesWithoutOrganization([
                { lineId: '1', sku: 'A' },
                { lineId: '2', sku: 'B' },
            ]),
        ).toEqual([
            {
                severity: 'error',
                lineRef: '1',
                messageKey: 'order.line-without-organization.missing',
                facts: { sku: 'A' },
            },
            {
                severity: 'error',
                lineRef: '2',
                messageKey: 'order.line-without-organization.missing',
                facts: { sku: 'B' },
            },
        ]);
    });

    it('reports nothing when every line has one', () => {
        expect(evaluateLinesWithoutOrganization([])).toEqual([]);
    });
});

describe('evaluateContractUnresolved', () => {
    it('reports an order-level finding when the buyer has no usable contract', () => {
        expect(
            evaluateContractUnresolved({ buyerCounterpartyId: 'cp-1', contractResolved: false }),
        ).toEqual([
            {
                severity: 'error',
                messageKey: 'order.contract-unresolved.missing',
                facts: { reason: 'no-usable-order-contract' },
            },
        ]);
    });

    it('passes a resolved contract and never flags a buyer it cannot identify', () => {
        expect(
            evaluateContractUnresolved({ buyerCounterpartyId: 'cp-1', contractResolved: true }),
        ).toEqual([]);
        expect(
            evaluateContractUnresolved({ buyerCounterpartyId: null, contractResolved: false }),
        ).toEqual([]);
    });
});
