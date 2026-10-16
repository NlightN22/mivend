import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderDataChecksRegistrar } from '@mivend/plugin-acquiring';
import { FreightTradingPointRegistrar } from '@mivend/plugin-freight-shipping';
import { OrderExportDataRegistrar } from '@mivend/plugin-reservation';

import { createOrderChecksWorld, resetWorld } from './order-checks.harness';
import type { OrderChecksWorld } from './order-checks.harness';

// Real Postgres and the real order subject, run through runChecks: proves the stage defaults of the
// order data controls (#241): warn at checkout, hold at pre-reserve, so the automatic reserve waits.
let w: OrderChecksWorld;

beforeAll(async () => {
    w = await createOrderChecksWorld('erp_order_data_checks');
    new OrderDataChecksRegistrar(
        w.registry,
        w.connection,
        { getForCustomer: async () => ({ id: '77' }) } as never,
        { resolveOrderContract: async () => null } as never,
    ).onModuleInit();
    new OrderExportDataRegistrar(w.registry).onModuleInit();
    new FreightTradingPointRegistrar(w.registry, w.connection, {} as never).onModuleInit();
});
afterAll(async () => {
    await w?.close();
});
beforeEach(async () => {
    await resetWorld(w);
});

const codes = (findings: Array<{ checkCode: string }>): string[] =>
    findings.map(f => f.checkCode).sort();

describe('order data controls through runChecks on a real order', () => {
    it('an order without a contract and a line without an organization holds the automatic reserve and only warns at checkout', async () => {
        const orderId = await w.seedOrder([{ sku: 'A', productErpId: 'p-1', quantity: 1 }]);

        const checkout = await w.orderChecks.run(w.ctx, orderId, 'checkout');
        expect(codes(checkout.findings)).toEqual(
            expect.arrayContaining([
                'order.contract-unresolved',
                'order.line-without-organization',
            ]),
        );
        expect(checkout.strongestConsequence).toBe('warn');

        const reserve = await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        expect(codes(reserve.findings)).toEqual(
            expect.arrayContaining([
                'order.contract-unresolved',
                'order.line-without-organization',
            ]),
        );
        expect(reserve.strongestConsequence).toBe('hold');

        expect(await w.orderChecks.isHeld(w.ctx, orderId, 'auto-trust-rule')).toBe(true);
        expect(await w.orderChecks.isHeld(w.ctx, orderId, 'manual')).toBe(false);
    });

    it('the freight control starts as warn at checkout and hold at pre-reserve', async () => {
        const policy = (stage: string) =>
            w.policies.resolve(w.ctx, 'delivery.freight-trading-point', stage, null);
        expect((await policy('checkout')).consequence).toBe('warn');
        expect((await policy('pre-reserve')).consequence).toBe('hold');
        expect((await policy('on-edit')).consequence).toBe('warn');
    });

    it('a policy loosened to warn at pre-reserve lets the automatic reserve through the queue', async () => {
        const orderId = await w.seedOrder([{ sku: 'A', productErpId: 'p-1', quantity: 1 }]);
        for (const checkCode of ['order.contract-unresolved', 'order.line-without-organization']) {
            await w.policies.update(w.ctx, {
                checkCode,
                stage: 'pre-reserve',
                consequence: 'warn',
                enabled: true,
            });
        }
        await w.policies.update(w.ctx, {
            checkCode: 'erp.export-data-missing',
            stage: 'pre-reserve',
            consequence: 'warn',
            enabled: true,
        });

        expect(await w.orderChecks.isHeld(w.ctx, orderId, 'auto-trust-rule')).toBe(false);
    });
});
