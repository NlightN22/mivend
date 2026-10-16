import { describe, expect, it } from 'vitest';
import type { OrderCheckSubject } from '@mivend/plugin-reservation';

import { evaluateContractWithStorageOrganization } from '../../order-checks/contract-with-storage-organization.check';
import type { OrderCheckData } from '../../order-checks/order-check-data';
import { evaluateOrganizationStock } from '../../order-checks/organization-stock.check';

const subject = (over: Partial<OrderCheckSubject> = {}): OrderCheckSubject => ({
    orderId: '1',
    orderCode: 'ORD-1',
    customerId: '1',
    branchId: null,
    buyerCounterpartyId: 'cp-1',
    warehouseErpId: 'wh-1',
    lines: [
        {
            lineId: 'l-1',
            productVariantId: 'v-1',
            sku: 'A',
            productErpId: 'p-1',
            organizationErpId: 'org-1',
            quantity: 10,
            storageUnitRatioToBase: 1,
        },
    ],
    ...over,
});

const data = (over: Partial<OrderCheckData> = {}): OrderCheckData => ({
    storageOrganizations: new Map([['p-1', ['org-1']]]),
    contractOrganizations: new Set(['org-1']),
    stockByProduct: new Map([['p-1', new Map([['org-1', 10]])]]),
    organizationNames: new Map([['org-1', 'Organization One']]),
    ...over,
});

const orgs = (stock: Record<string, number>): OrderCheckData['stockByProduct'] =>
    new Map([['p-1', new Map(Object.entries(stock))]]);

describe('erp.contract-with-storage-organization', () => {
    it('passes when the line organization has a customer contract with the buyer', () => {
        expect(evaluateContractWithStorageOrganization(subject(), data())).toEqual([]);
    });

    it('fails when only another storage organization has a contract (no rescue)', () => {
        const d = data({
            storageOrganizations: new Map([['p-1', ['org-1', 'org-2']]]),
            contractOrganizations: new Set(['org-2']),
            stockByProduct: orgs({ 'org-1': 10, 'org-2': 50 }),
        });
        const [finding] = evaluateContractWithStorageOrganization(subject(), d);
        expect(finding).toMatchObject({
            severity: 'error',
            lineRef: 'l-1',
            messageKey: 'erp.contract-with-storage-organization.missing',
            facts: {
                reason: 'no-contract-with-line-organization',
                productErpId: 'p-1',
                warehouseErpId: 'wh-1',
                organization: { id: 'org-1', name: 'Organization One' },
                storageOrganizations: [
                    { id: 'org-1', name: 'Organization One', stock: 10, hasContract: false },
                    { id: 'org-2', name: null, stock: 50, hasContract: true },
                ],
            },
        });
    });

    it('fails when the buyer has no customer contract at all', () => {
        const d = data({ contractOrganizations: new Set() });
        expect(evaluateContractWithStorageOrganization(subject(), d)).toHaveLength(1);
    });

    it('stays silent for an unknown line organization, one outside the storage set, or unknown warehouse/buyer', () => {
        const noContract = data({ contractOrganizations: new Set() });
        const unknownOrg = subject({
            lines: [{ ...subject().lines[0], organizationErpId: null }],
        });
        expect(evaluateContractWithStorageOrganization(unknownOrg, noContract)).toEqual([]);
        const outside = subject({
            lines: [{ ...subject().lines[0], organizationErpId: 'org-9' }],
        });
        expect(evaluateContractWithStorageOrganization(outside, noContract)).toEqual([]);
        expect(
            evaluateContractWithStorageOrganization(
                subject(),
                data({ storageOrganizations: new Map(), contractOrganizations: new Set() }),
            ),
        ).toEqual([]);
        expect(
            evaluateContractWithStorageOrganization(subject({ warehouseErpId: null }), noContract),
        ).toEqual([]);
        expect(
            evaluateContractWithStorageOrganization(
                subject({ buyerCounterpartyId: null }),
                noContract,
            ),
        ).toEqual([]);
    });
});

describe('erp.organization-stock', () => {
    it('passes when the line organization covers the needed quantity exactly', () => {
        expect(evaluateOrganizationStock(subject(), data())).toEqual([]);
    });

    it('fails with needed, available and the per-organization breakdown', () => {
        const d = data({ stockByProduct: orgs({ 'org-1': 4 }) });
        const [finding] = evaluateOrganizationStock(subject(), d);
        expect(finding.messageKey).toBe('erp.organization-stock.short');
        expect(finding.facts).toMatchObject({
            reason: 'line-organization-stock-short',
            needed: 10,
            available: 4,
            organization: { id: 'org-1', name: 'Organization One' },
            storageOrganizations: [
                { id: 'org-1', name: 'Organization One', stock: 4, hasContract: true },
            ],
        });
    });

    it('does not let other organizations stock cover the line', () => {
        const d = data({
            storageOrganizations: new Map([['p-1', ['org-1', 'org-2']]]),
            contractOrganizations: new Set(['org-1', 'org-2']),
            stockByProduct: orgs({ 'org-1': 2, 'org-2': 50 }),
        });
        const [finding] = evaluateOrganizationStock(subject(), d);
        expect(finding.facts).toMatchObject({ available: 2, needed: 10 });
    });

    it('keeps a negative balance of the line organization', () => {
        const d = data({ stockByProduct: orgs({ 'org-1': -3 }) });
        const [finding] = evaluateOrganizationStock(subject(), d);
        expect(finding.facts).toMatchObject({ available: -3, needed: 10 });
    });

    it('converts the line quantity into the storage unit', () => {
        const lines = [{ ...subject().lines[0], quantity: 40, storageUnitRatioToBase: 4 }];
        expect(evaluateOrganizationStock(subject({ lines }), data())).toEqual([]);
        const tooMany = [{ ...subject().lines[0], quantity: 44, storageUnitRatioToBase: 4 }];
        const [finding] = evaluateOrganizationStock(subject({ lines: tooMany }), data());
        expect(finding.facts).toMatchObject({ needed: 11, available: 10 });
    });

    it('treats a product without stock rows as zero available, never as unknown', () => {
        expect(
            evaluateOrganizationStock(subject(), data({ stockByProduct: new Map() })),
        ).toHaveLength(1);
    });

    it('stays silent for an unknown line organization, one outside the storage set, or unknown warehouse/buyer', () => {
        const empty = data({ stockByProduct: new Map() });
        const line = subject().lines[0];
        expect(
            evaluateOrganizationStock(
                subject({ lines: [{ ...line, organizationErpId: null }] }),
                empty,
            ),
        ).toEqual([]);
        expect(
            evaluateOrganizationStock(
                subject({ lines: [{ ...line, organizationErpId: 'org-9' }] }),
                empty,
            ),
        ).toEqual([]);
        expect(evaluateOrganizationStock(subject({ warehouseErpId: null }), empty)).toEqual([]);
        expect(evaluateOrganizationStock(subject({ buyerCounterpartyId: null }), empty)).toEqual(
            [],
        );
    });
});
