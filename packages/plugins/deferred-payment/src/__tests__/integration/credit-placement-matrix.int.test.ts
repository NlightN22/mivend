import { describe, expect, it } from 'vitest';
import { FREIGHT_SHIPPING_METHOD_CODE } from 'shared';

import { PLACEMENT_CASES, type PlacementCase } from '../../placement-cases';
import { useCreditPlacementHarness } from './credit-placement.harness';

const h = useCreditPlacementHarness('credit_placement_matrix');
const ORDER_ID = 999_999;

async function placeCase(c: PlacementCase, metadata: Record<string, unknown> = {}) {
    const buyer = await h.addBuyer(1_000_000, 0, c.terms === 'deferred' ? 14 : 0);
    await h.addShippingLine(
        ORDER_ID,
        c.fulfillment === 'delivery' ? FREIGHT_SHIPPING_METHOD_CODE : 'pickup',
    );
    return h.place(buyer, 1_000, c.form, ORDER_ID, metadata);
}

describe('confirmation matrix at placement (real Postgres)', () => {
    it('keeps every case on the ERP route with the default policies', async () => {
        for (const c of PLACEMENT_CASES) {
            const { decision } = await placeCase(c);
            expect(decision, c.code).toMatchObject({
                route: 'erp-now',
                creditLimitExceeded: false,
            });
            await h.run(
                `TRUNCATE shipping_line, shipping_method, customer, counterparty RESTART IDENTITY`,
            );
        }
    });

    it('holds exactly the case whose policy is hold, with no code change', async () => {
        for (const target of PLACEMENT_CASES) {
            await h.run(`TRUNCATE check_policy`);
            await h.setCasePolicy(target.code, 'hold');
            for (const c of PLACEMENT_CASES) {
                const { decision, metadata } = await placeCase(c);
                const held = c.code === target.code;
                expect(decision.route, `${target.code} / ${c.code}`).toBe(
                    held ? 'manager-confirmation' : 'erp-now',
                );
                expect(metadata.public).toMatchObject({
                    awaitingManagerConfirmation: held,
                    creditLimitExceeded: false,
                });
                await h.run(
                    `TRUNCATE shipping_line, shipping_method, customer, counterparty RESTART IDENTITY`,
                );
            }
        }
    });

    it('follows a policy change between two placements of the same case', async () => {
        const c = PLACEMENT_CASES[0];
        expect((await placeCase(c)).decision.route).toBe('erp-now');
        await h.setCasePolicy(c.code, 'hold');
        await h.run(`TRUNCATE shipping_line, shipping_method RESTART IDENTITY`);
        expect((await placeCase(c)).decision.route).toBe('manager-confirmation');
        await h.run(`UPDATE check_policy SET enabled = false`);
        await h.run(`TRUNCATE shipping_line, shipping_method RESTART IDENTITY`);
        expect((await placeCase(c)).decision.route).toBe('erp-now');
    });

    it('lets a branch policy override the global one on placement', async () => {
        const c = PLACEMENT_CASES[0];
        await h.setCasePolicy(c.code, 'warn');
        await h.setCasePolicy(c.code, 'hold', true, 'branch-a');
        const branchOrder = async (branchId: string) => {
            const buyer = await h.addBuyer(1_000_000, 0, c.terms === 'deferred' ? 14 : 0);
            await h.addShippingLine(ORDER_ID, 'pickup');
            const order = h.orderOf(buyer, 1_000, ORDER_ID);
            (order as unknown as { customFields: object }).customFields = { branchId };
            return h.placement.place(h.ctx, order, c.form, {});
        };
        expect((await branchOrder('branch-a')).decision.route).toBe('manager-confirmation');
        await h.run(
            `TRUNCATE shipping_line, shipping_method, customer, counterparty RESTART IDENTITY`,
        );
        expect((await branchOrder('branch-b')).decision.route).toBe('erp-now');
    });

    it('records the matrix case and the hold in the placement metadata', async () => {
        const c = PLACEMENT_CASES[0];
        await h.setCasePolicy(c.code, 'hold');
        const { metadata } = await placeCase(c);
        expect(metadata.placement).toMatchObject({
            confirmationCase: c.code,
            confirmationHold: true,
        });
    });

    it('lets the credit limit decide before the matrix when it is exceeded', async () => {
        const c = PLACEMENT_CASES[0];
        await h.setCasePolicy(c.code, 'hold');
        h.state.allowExceeding = true;
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 95_000);
        await h.addShippingLine(ORDER_ID, 'pickup');
        const acked = await h.place(buyer, 10_000, c.form, ORDER_ID, {
            creditLimitAcknowledged: true,
        });
        expect(acked.decision).toMatchObject({ route: 'erp-now', creditLimitExceeded: true });
    });

    it('does not apply the matrix to a card payment', async () => {
        for (const c of PLACEMENT_CASES) await h.setCasePolicy(c.code, 'hold');
        const buyer = await h.addBuyer(1_000_000);
        expect((await h.place(buyer, 1_000, 'card')).decision.route).toBe('after-payment');
    });
});
