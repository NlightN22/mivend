import { describe, expect, it } from 'vitest';

import { useCreditPlacementHarness } from './credit-placement.harness';

const h = useCreditPlacementHarness('credit_placement');

describe('placement matrix on real data', () => {
    it('sends prepayment cash and bank transfer to the ERP now with the short reserve', async () => {
        const buyer = await h.addBuyer(0, 0, 0);
        h.state.reserveDays = 5;
        for (const form of ['cash', 'bank-transfer'] as const) {
            const { decision, metadata } = await h.place(buyer, 1_000, form);
            expect(decision).toMatchObject({ route: 'erp-now', creditLimitExceeded: false });
            expect(metadata.placement).toEqual({
                route: 'erp-now',
                countsAgainstLimit: true,
                reserveDays: 5,
            });
        }
    });

    it('treats a limit without payment delay days as prepayment', async () => {
        const buyer = await h.addBuyer(100_000, 0, 0);
        const { decision } = await h.place(buyer, 500_000);
        expect(decision).toMatchObject({ route: 'erp-now', creditLimitExceeded: false });
    });

    it('keeps the standard reserve (no short TTL) for orders on credit terms', async () => {
        const buyer = await h.addBuyer(100_000);
        const { metadata } = await h.place(buyer, 1_000);
        expect(metadata.placement).toMatchObject({ reserveDays: null });
    });

    it('places a card order after payment, not counted against the limit', async () => {
        const buyer = await h.addBuyer(100_000);
        const result = await h.place(buyer, 40_000, 'card');
        expect(result.decision).toMatchObject({
            route: 'after-payment',
            countsAgainstLimit: false,
        });
        expect(result.amount).toBe(4_000_000);
    });

    it('cures an over-limit card order: it goes to the ERP after payment, not to a manager', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 70_000);
        await h.addOrder(buyer, 60_000);
        const result = await h.place(buyer, 20_000, 'card');
        expect(result.amount).toBe(3_000_000 + 2_000_000); // 30k excess + 20k order
        expect(result.decision).toMatchObject({
            route: 'after-payment',
            countsAgainstLimit: false,
            creditLimitExceeded: false,
        });
    });

    it('adds the ERP balance to the excess and never charges a negative excess', async () => {
        const buyer = await h.addBuyer(100_000, 120_000);
        expect((await h.place(buyer, 10_000, 'card')).amount).toBe(2_000_000 + 1_000_000);
        const free = await h.addBuyer(100_000, 10_000);
        expect((await h.place(free, 10_000, 'card')).amount).toBe(1_000_000);
    });

    it('does not inflate cash or bank-transfer amounts with the excess', async () => {
        const buyer = await h.addBuyer(100_000, 120_000);
        expect((await h.place(buyer, 10_000, 'cash')).amount).toBe(1_000_000);
    });

    it('waits for a manager when over the limit and exceeding is not allowed, even if acknowledged', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 95_000);
        const { decision } = await h.place(buyer, 10_000, 'cash', 999_999, {
            creditLimitAcknowledged: true,
        });
        expect(decision.route).toBe('manager-confirmation');
    });

    it('publishes the manager-wait flag only for the manager-confirmation route', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 95_000);
        const waiting = await h.place(buyer, 10_000, 'cash');
        expect(waiting.metadata.public).toMatchObject({ awaitingManagerConfirmation: true });
        const card = await h.place(buyer, 10_000, 'card');
        expect(card.metadata.public).toMatchObject({ awaitingManagerConfirmation: false });
    });

    it('goes to the ERP now when over the limit, exceeding is allowed and acknowledged', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 95_000);
        h.state.allowExceeding = true;
        const acked = await h.place(buyer, 10_000, 'bank-transfer', 999_999, {
            creditLimitAcknowledged: true,
        });
        expect(acked.decision).toMatchObject({ route: 'erp-now', creditLimitExceeded: true });
        const silent = await h.place(buyer, 10_000, 'bank-transfer');
        expect(silent.decision.route).toBe('manager-confirmation');
    });

    it('places a customer without a counterparty as prepayment', async () => {
        const [cu] = await h.run(`INSERT INTO customer DEFAULT VALUES RETURNING id`);
        const result = await h.place({ customerId: Number(cu.id), counterpartyId: 0 }, 1);
        expect(result.decision.route).toBe('erp-now');
        expect(result.metadata.placement).toMatchObject({ reserveDays: 3 });
    });
});

describe('credit-exposure lock (concurrent writers, real Postgres)', () => {
    // Mirrors addPaymentToOrder: the placement and the payment row share one transaction.
    async function placeAndPay(buyer: Awaited<ReturnType<typeof h.addBuyer>>, orderId: number) {
        return h.connection.withTransaction({}, async tx => {
            const result = await h.placement.place(
                tx as never,
                {
                    id: orderId,
                    totalWithTax: 6_000_000,
                    customer: { id: buyer.customerId },
                } as never,
                'cash',
                {},
            );
            await (tx as { qr: { query: (s: string, p: unknown[]) => Promise<unknown> } }).qr.query(
                `INSERT INTO payment ("orderId", method, state, amount, metadata) VALUES ($1, 'cash', 'Authorized', 6000000, $2)`,
                [orderId, JSON.stringify(result.metadata)],
            );
            return result.decision;
        });
    }

    it('lets only the order that fits the limit pass unflagged when two race', async () => {
        const buyer = await h.addBuyer(100_000);
        const first = await h.addOrderRow(buyer, 60_000);
        const second = await h.addOrderRow(buyer, 60_000);

        const decisions = await Promise.all([
            placeAndPay(buyer, first),
            placeAndPay(buyer, second),
        ]);

        expect(decisions.filter(d => !d.creditLimitExceeded)).toHaveLength(1);
        expect(decisions.filter(d => d.creditLimitExceeded)).toHaveLength(1);
        const flagged = await h.run(
            `SELECT count(*)::int AS n FROM payment WHERE metadata::jsonb -> 'public' ->> 'creditLimitExceeded' = 'true'`,
        );
        expect(flagged[0].n).toBe(1);
    });

    it('does not serialize two different counterparties', async () => {
        const a = await h.addBuyer(100_000);
        const b = await h.addBuyer(100_000);
        const orderA = await h.addOrderRow(a, 60_000);
        const orderB = await h.addOrderRow(b, 60_000);
        const decisions = await Promise.all([placeAndPay(a, orderA), placeAndPay(b, orderB)]);
        expect(decisions.every(d => !d.creditLimitExceeded)).toBe(true);
    });
});
