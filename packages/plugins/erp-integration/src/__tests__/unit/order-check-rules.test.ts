import { describe, expect, it } from 'vitest';
import type { OrderCheckSubject } from '@mivend/plugin-reservation';

import { evaluateContractWithStorageOrganization } from '../../order-checks/contract-with-storage-organization.check';
import type { OrderCheckData } from '../../order-checks/order-check-data';
import { evaluateOrganizationStock } from '../../order-checks/organization-stock.check';

const subject = (over: Partial<OrderCheckSubject> = {}): OrderCheckSubject => ({
    orderId: '1',
    orderCode: 'ORD-1',
    customerId: '1',
    buyerCounterpartyId: 'cp-1',
    warehouseErpId: 'wh-1',
    lines: [
        {
            lineId: 'l-1',
            productVariantId: 'v-1',
            sku: 'A',
            productErpId: 'p-1',
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

describe('erp.contract-with-storage-organization', () => {
    it('passes when a storage organization has a customer contract with the buyer', () => {
        expect(evaluateContractWithStorageOrganization(subject(), data())).toEqual([]);
    });

    it('passes with several storage organizations when one of them intersects', () => {
        const d = data({
            storageOrganizations: new Map([['p-1', ['org-1', 'org-2']]]),
            contractOrganizations: new Set(['org-2', 'org-3']),
        });
        expect(evaluateContractWithStorageOrganization(subject(), d)).toEqual([]);
    });

    it('fails with organization names when the sets do not intersect', () => {
        const d = data({ contractOrganizations: new Set(['org-2']) });
        const [finding] = evaluateContractWithStorageOrganization(subject(), d);
        expect(finding).toMatchObject({
            severity: 'error',
            lineRef: 'l-1',
            messageKey: 'erp.contract-with-storage-organization.missing',
            facts: {
                reason: 'no-contract-with-storage-organization',
                productErpId: 'p-1',
                warehouseErpId: 'wh-1',
                storageOrganizations: [{ id: 'org-1', name: 'Organization One' }],
                contractOrganizations: [{ id: 'org-2', name: null }],
            },
        });
    });

    it('fails when the buyer has no customer contract at all', () => {
        const d = data({ contractOrganizations: new Set() });
        expect(evaluateContractWithStorageOrganization(subject(), d)).toHaveLength(1);
    });

    it('stays silent when no storage organization is known, the warehouse or the buyer is unknown', () => {
        const none = data({ storageOrganizations: new Map() });
        expect(evaluateContractWithStorageOrganization(subject(), none)).toEqual([]);
        expect(
            evaluateContractWithStorageOrganization(subject({ warehouseErpId: null }), data()),
        ).toEqual([]);
        expect(
            evaluateContractWithStorageOrganization(
                subject({ buyerCounterpartyId: null }),
                data({ contractOrganizations: new Set() }),
            ),
        ).toEqual([]);
    });
});

describe('erp.organization-stock', () => {
    it('passes when eligible stock covers the needed quantity exactly', () => {
        expect(evaluateOrganizationStock(subject(), data())).toEqual([]);
    });

    it('fails with the storage reason when the storage organizations hold too little', () => {
        const d = data({ stockByProduct: new Map([['p-1', new Map([['org-1', 4]])]]) });
        const [finding] = evaluateOrganizationStock(subject(), d);
        expect(finding.facts).toMatchObject({
            reason: 'storage-organizations-short',
            needed: 10,
            available: 4,
            storageStock: 4,
        });
        expect(finding.messageKey).toBe('erp.organization-stock.storage-organizations-short');
    });

    it('fails with the contract reason when only organizations without a contract hold the stock', () => {
        const d = data({
            storageOrganizations: new Map([['p-1', ['org-1', 'org-2']]]),
            contractOrganizations: new Set(['org-1']),
            stockByProduct: new Map([
                [
                    'p-1',
                    new Map([
                        ['org-1', 2],
                        ['org-2', 50],
                    ]),
                ],
            ]),
        });
        const [finding] = evaluateOrganizationStock(subject(), d);
        expect(finding.facts).toMatchObject({
            reason: 'contract-organizations-short',
            available: 2,
            storageStock: 52,
            eligibleOrganizations: [{ id: 'org-1', name: 'Organization One' }],
        });
    });

    it('sums negative balances as the ERP does', () => {
        const d = data({
            storageOrganizations: new Map([['p-1', ['org-1', 'org-2']]]),
            contractOrganizations: new Set(['org-1', 'org-2']),
            stockByProduct: new Map([
                [
                    'p-1',
                    new Map([
                        ['org-1', 12],
                        ['org-2', -3],
                    ]),
                ],
            ]),
        });
        const [finding] = evaluateOrganizationStock(subject(), d);
        expect(finding.facts).toMatchObject({ available: 9, needed: 10 });
    });

    it('converts the line quantity into the storage unit', () => {
        const lines = [{ ...subject().lines[0], quantity: 40, storageUnitRatioToBase: 4 }];
        expect(evaluateOrganizationStock(subject({ lines }), data())).toEqual([]);
        const tooMany = [{ ...subject().lines[0], quantity: 44, storageUnitRatioToBase: 4 }];
        const [finding] = evaluateOrganizationStock(subject({ lines: tooMany }), data());
        expect(finding.facts).toMatchObject({ needed: 11, available: 10 });
    });

    it('treats a product without stock rows as zero available, never as unknown', () => {
        const d = data({ stockByProduct: new Map() });
        expect(evaluateOrganizationStock(subject(), d)).toHaveLength(1);
    });

    it('stays silent without a known storage organization, warehouse or buyer', () => {
        expect(
            evaluateOrganizationStock(subject(), data({ storageOrganizations: new Map() })),
        ).toEqual([]);
        expect(
            evaluateOrganizationStock(
                subject({ warehouseErpId: null }),
                data({ stockByProduct: new Map() }),
            ),
        ).toEqual([]);
    });
});
