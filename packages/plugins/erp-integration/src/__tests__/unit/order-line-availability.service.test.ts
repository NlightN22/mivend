import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderLineAvailabilityService } from '../../order-checks/order-line-availability.service';
import type { OrderCheckData } from '../../order-checks/order-check-data';

const ctx = {} as RequestContext;

function build(options: {
    warehouseFree: number;
    ownStock: number;
    otherStock?: number;
    quantity?: number;
}) {
    const data: OrderCheckData = {
        storageOrganizations: new Map([['p1', ['org-own', 'org-other']]]),
        contractOrganizations: new Set(['org-own']),
        stockByProduct: new Map([
            [
                'p1',
                new Map([
                    ['org-own', options.ownStock],
                    ['org-other', options.otherStock ?? 0],
                ]),
            ],
        ]),
        organizationNames: new Map([
            ['org-own', 'Own'],
            ['org-other', 'Other'],
        ]),
    };
    const subject = {
        orderId: '1',
        warehouseErpId: 'wh-1',
        lines: [
            {
                lineId: 'l1',
                productVariantId: 'v1',
                sku: 's',
                productErpId: 'p1',
                organizationErpId: 'org-own',
                quantity: options.quantity ?? 10,
                storageUnitRatioToBase: 1,
            },
        ],
    };
    const service = new OrderLineAvailabilityService(
        {
            getRepository: (_c: unknown, entity: { name: string }) =>
                entity.name === 'Order'
                    ? { findOne: async () => ({ customFields: { branchId: 'b1' } }) }
                    : {
                          find: async () => [
                              { id: 'loc1', customFields: { warehouseErpId: 'wh-1' } },
                          ],
                      },
        } as never,
        { load: async () => subject } as never,
        { load: async () => data } as never,
        {
            findBranchStockLocationIds: async () => ['loc1'],
            getFreeByLocation: async () =>
                new Map([['v1', new Map([['loc1', options.warehouseFree]])]]),
        } as never,
        { findAll: async () => [{ erpId: 'wh-1', name: 'Main' }] } as never,
        { register: () => undefined } as never,
    );
    return service.forOrder(ctx, '1');
}

describe('OrderLineAvailabilityService', () => {
    it('is covered when warehouse and own organization both hold enough', async () => {
        const [line] = await build({ warehouseFree: 20, ownStock: 15 });
        expect(line.fitting).toBe(10);
        expect(line.limitedBy).toBeNull();
    });

    it('is limited by the warehouse', async () => {
        const [line] = await build({ warehouseFree: 4, ownStock: 15 });
        expect(line).toMatchObject({ fitting: 4, limitedBy: 'warehouse' });
        expect(line.warehouses).toEqual([{ warehouseErpId: 'wh-1', name: 'Main', free: 4 }]);
    });

    it('is limited by the own organization, other organizations never rescue it', async () => {
        const [line] = await build({ warehouseFree: 20, ownStock: 3, otherStock: 100 });
        expect(line).toMatchObject({ fitting: 3, limitedBy: 'organization' });
        expect(line.organizations.find(o => o.selling)?.id).toBe('org-own');
        expect(line.organizations.find(o => o.id === 'org-other')?.stock).toBe(100);
    });

    it('treats a negative organization balance as nothing available', async () => {
        const [line] = await build({ warehouseFree: 20, ownStock: -5 });
        expect(line.fitting).toBe(0);
    });
});
