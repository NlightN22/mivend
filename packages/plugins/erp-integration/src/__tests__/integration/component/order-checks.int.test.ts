import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    BUYER_COUNTERPARTY,
    createOrderChecksWorld,
    resetWorld,
    seedReservation,
} from './order-checks.harness';
import type { OrderChecksWorld } from './order-checks.harness';

// Real Postgres: lock serialization, stale flags and the raw candidate queries cannot be proven by mocks.
let w: OrderChecksWorld;

beforeAll(async () => {
    w = await createOrderChecksWorld('erp_order_checks');
});
afterAll(async () => {
    await w?.close();
});
beforeEach(async () => {
    await resetWorld(w);
});

const codes = async (orderId: string): Promise<string[]> =>
    (await w.results(orderId)).map(r => String(r['checkCode']));

describe('ERP-requirement checks on real order data', () => {
    it('passes when a customer contract with the storage organization and enough stock exist', async () => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 },
        ]);
        await w.seedAssignment('p-1', 'org-1');
        await w.seedContract('org-1');
        await w.seedStock('p-1', 'org-1', 5);

        const run = await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');

        expect(run.findings).toEqual([]);
        expect(await w.results(orderId)).toEqual([]);
    });

    it('reports a missing contract of the line organization; other organizations do not rescue it', async () => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 },
        ]);
        await w.seedAssignment('p-1', 'org-1');
        await w.seedAssignment('p-1', 'org-2');
        await w.seedContract('org-2');
        await w.seedStock('p-1', 'org-1', 50);
        await w.seedStock('p-1', 'org-2', 50);

        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');

        const rows = await w.results(orderId);
        expect(rows.map(r => r['checkCode'])).toEqual(['erp.contract-with-storage-organization']);
        expect(rows[0]['facts']).toMatchObject({
            reason: 'no-contract-with-line-organization',
            organization: { id: 'org-1' },
            storageOrganizations: [
                { id: 'org-1', stock: 50, hasContract: false },
                { id: 'org-2', stock: 50, hasContract: true },
            ],
        });
        const flag = await w.dataSource.query(
            `SELECT "customFieldsHascheckfindings" AS f FROM "order" WHERE id = $1`,
            [orderId],
        );
        expect(flag[0].f).toBe(true);
    });

    it('reports a stock shortfall of the line organization even when another one holds enough', async () => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 },
        ]);
        await w.seedAssignment('p-1', 'org-1');
        await w.seedAssignment('p-1', 'org-2');
        await w.seedContract('org-1');
        await w.seedContract('org-2');
        await w.seedStock('p-1', 'org-1', 4);
        await w.seedStock('p-1', 'org-2', 100);

        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');

        const rows = await w.results(orderId);
        expect(rows.map(r => r['checkCode'])).toEqual(['erp.organization-stock']);
        expect(rows[0]['facts']).toMatchObject({
            reason: 'line-organization-stock-short',
            needed: 5,
            available: 4,
            warehouseErpId: 'wh-1',
        });
    });

    it('keeps a negative balance of the line organization as is', async () => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 1 },
        ]);
        await w.seedAssignment('p-1', 'org-1');
        await w.seedContract('org-1');
        await w.seedStock('p-1', 'org-1', -2);

        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');

        expect((await w.results(orderId))[0]['facts']).toMatchObject({ available: -2 });
    });

    it('does not flag a line with an unknown organization or one outside the storage set', async () => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', quantity: 5 },
            { sku: 'B', productErpId: 'p-2', organizationErpId: 'org-9', quantity: 5 },
        ]);
        await w.seedAssignment('p-1', 'org-1');
        await w.seedAssignment('p-2', 'org-1');

        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');

        expect(await w.results(orderId)).toEqual([]);
    });

    it('does not count an inactive contract, a non-customer contract or another counterparty', async () => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 1 },
        ]);
        await w.seedAssignment('p-1', 'org-1');
        await w.seedContract('org-1', { isActive: false });
        await w.seedContract('org-1', { isCustomerContract: false });
        await w.seedContract('org-1', { isCustomerContract: null });
        await w.seedContract('org-1', { counterpartyId: `not-${BUYER_COUNTERPARTY}` });
        await w.seedStock('p-1', 'org-1', 10);

        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');

        expect(await codes(orderId)).toContain('erp.contract-with-storage-organization');
    });

    it('ignores storage rows of another warehouse and says nothing without an organization row', async () => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 1 },
        ]);
        await w.seedAssignment('p-1', 'org-9', 'other-warehouse');

        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');

        expect(await w.results(orderId)).toEqual([]);
    });

    it('takes the warehouse of the active reservation and agrees between reserve and send stages', async () => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 },
        ]);
        await w.seedAssignment('p-1', 'org-1');
        await seedReservation(w, orderId, 'auto-trust-rule');

        const reserve = await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        const afterReserve = await w.results(orderId);
        const send = await w.orderChecks.run(w.ctx, orderId, 'pre-send-to-erp');
        const afterSend = await w.results(orderId);

        expect(reserve.findings.length).toBeGreaterThan(0);
        expect(send.findings).toEqual(reserve.findings);
        expect(afterSend.map(r => r['facts'])).toEqual(afterReserve.map(r => r['facts']));
        expect(afterSend.every(r => r['stage'] === 'pre-send-to-erp')).toBe(true);
    });
});

describe('policy as data', () => {
    it('hold keeps an automatic trigger in the queue and a manual one proceeds, with no code change', async () => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 },
        ]);
        await w.seedAssignment('p-1', 'org-1');

        expect(await w.orderChecks.isHeld(w.ctx, orderId, 'auto-trust-rule')).toBe(false);

        await w.policies.update(w.ctx, {
            checkCode: 'erp.organization-stock',
            stage: 'pre-reserve',
            consequence: 'hold',
            enabled: true,
        });

        expect(await w.orderChecks.isHeld(w.ctx, orderId, 'auto-trust-rule')).toBe(true);
        expect(await w.orderChecks.isHeld(w.ctx, orderId, 'manual')).toBe(false);
    });

    it('rejects block for this subject type', async () => {
        await w.orderChecks.isHeld(w.ctx, await w.seedOrder([]), 'manual');
        await expect(
            w.policies.update(w.ctx, {
                checkCode: 'erp.organization-stock',
                stage: 'pre-reserve',
                consequence: 'block',
                enabled: true,
            }),
        ).rejects.toThrow();
    });
});

describe('stale marking', () => {
    const failingOrder = async (): Promise<string> => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 },
        ]);
        await w.seedAssignment('p-1', 'org-1');
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        return orderId;
    };
    const staleFlags = async (orderId: string): Promise<boolean[]> =>
        (await w.results(orderId)).map(r => r['stale'] as boolean);

    it('a stock change of the line product flags the order, an unrelated product does not', async () => {
        const orderId = await failingOrder();

        expect(await w.stale.markForProducts(w.ctx, ['other'])).toBe(0);
        expect(await staleFlags(orderId)).not.toContain(true);

        expect(await w.stale.markForProducts(w.ctx, ['p-1'])).toBe(1);
        expect(await staleFlags(orderId)).not.toContain(false);
    });

    it('a contract change of the buyer flags the order, a recompute clears it', async () => {
        const orderId = await failingOrder();
        await w.seedContract('org-1', { erpId: 'contract-1' });

        await w.stale.markForContract(w.ctx, 'contract-1');
        expect(await staleFlags(orderId)).not.toContain(false);

        await w.orderChecks.recompute(w.ctx, orderId);
        expect(await staleFlags(orderId)).not.toContain(true);
    });

    it('leaves cancelled orders and orders without stored findings alone', async () => {
        const cancelled = await w.seedOrder(
            [{ sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 }],
            {
                state: 'Cancelled',
            },
        );
        await w.seedAssignment('p-1', 'org-1');
        await w.orderChecks.run(w.ctx, cancelled, 'pre-reserve');

        expect(await w.stale.markForProducts(w.ctx, ['p-1'])).toBe(0);
    });

    it('a stale mark issued while a recompute holds old data is not lost', async () => {
        const orderId = await failingOrder();
        let release!: () => void;
        const gate = new Promise<void>(resolve => (release = resolve));
        const realLoad = w.data.load.bind(w.data);
        const spy = vi.spyOn(w.data, 'load').mockImplementation(async (...args) => {
            const loaded = await realLoad(...args);
            await gate;
            return loaded;
        });

        const recompute = w.orderChecks.run(w.ctx, orderId, 'on-edit');
        await new Promise(r => setTimeout(r, 50));
        await w.seedStock('p-1', 'org-1', 100);
        const marking = w.stale.markForProducts(w.ctx, ['p-1']);
        release();
        await Promise.all([recompute, marking]);
        spy.mockRestore();

        expect(await staleFlags(orderId)).not.toContain(false);
    });
});

describe('stock update then recompute', () => {
    it('a recompute after a stock update drops the resolved finding', async () => {
        const orderId = await w.seedOrder([
            { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 },
        ]);
        await w.seedAssignment('p-1', 'org-1');
        await w.seedContract('org-1');
        await w.seedStock('p-1', 'org-1', 1);
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');

        await w.seedStock('p-1', 'org-1', 10);
        await w.stale.markForProducts(w.ctx, ['p-1']);
        await w.orderChecks.recompute(w.ctx, orderId);

        expect(await w.results(orderId)).toEqual([]);
    });
});

describe('visibility and counters', () => {
    it('an order outside the actor scope returns no results and cannot be recomputed', async () => {
        const mine = await w.seedOrder(
            [{ sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 }],
            {
                branchId: 'branch-a',
            },
        );
        const foreign = await w.seedOrder(
            [{ sku: 'B', productErpId: 'p-2', organizationErpId: 'org-1', quantity: 5 }],
            {
                branchId: 'branch-b',
            },
        );
        await w.seedAssignment('p-1', 'org-1');
        await w.seedAssignment('p-2', 'org-1');
        await w.orderChecks.run(w.ctx, mine, 'pre-reserve');
        await w.orderChecks.run(w.ctx, foreign, 'pre-reserve');
        w.visibleBranch.value = 'branch-a';

        expect((await w.checks.findResults(w.ctx, 'order', mine)).length).toBeGreaterThan(0);
        expect(await w.checks.findResults(w.ctx, 'order', foreign)).toEqual([]);
        await expect(w.orderChecks.recompute(w.ctx, foreign)).rejects.toThrow();
        expect((await w.orderChecks.recompute(w.ctx, mine)).length).toBeGreaterThan(0);
    });

    it('health counts failing orders per check code and reason, excluding cancelled orders', async () => {
        for (const state of ['PaymentAuthorized', 'PaymentAuthorized', 'Cancelled']) {
            const id = await w.seedOrder(
                [{ sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 }],
                {
                    state,
                },
            );
            await w.seedAssignment('p-1', 'org-1');
            await w.orderChecks.run(w.ctx, id, 'pre-reserve');
        }
        await w.dataSource.query(
            `UPDATE check_result SET stale = true WHERE "subjectId" = (SELECT min(id)::text FROM "order")`,
        );

        const rows = await w.health.getHealth(w.ctx);

        expect(rows).toEqual(
            expect.arrayContaining([
                {
                    checkCode: 'erp.contract-with-storage-organization',
                    reason: 'no-contract-with-line-organization',
                    orderCount: 2,
                    staleOrderCount: 1,
                },
            ]),
        );
    });
});
