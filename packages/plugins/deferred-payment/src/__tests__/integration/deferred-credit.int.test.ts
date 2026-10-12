import { describe, expect, it } from 'vitest';

import { useCreditPlacementHarness } from './credit-placement.harness';

const h = useCreditPlacementHarness('deferred_credit');
const exceeded = async (...args: Parameters<typeof h.place>): Promise<boolean> =>
    (await h.place(...args)).decision.creditLimitExceeded;

describe('credit control over open orders (real SQL + decide)', () => {
    it('places within the limit unflagged and sends cash to the ERP now', async () => {
        const buyer = await h.addBuyer(100_000);
        const result = await h.place(buyer, 40_000);
        expect(result.decision).toMatchObject({
            route: 'erp-now',
            creditLimitExceeded: false,
            countsAgainstLimit: true,
        });
        expect(result.metadata.public).toEqual({
            creditLimitExceeded: false,
            awaitingManagerConfirmation: false,
        });
    });

    it('still places a single order over the limit but flags it for a manager', async () => {
        const buyer = await h.addBuyer(100_000);
        expect((await h.place(buyer, 100_000.01)).decision).toMatchObject({
            route: 'manager-confirmation',
            creditLimitExceeded: true,
        });
    });

    it('lands exactly on the limit without flagging, one kopeck more flags', async () => {
        const buyer = await h.addBuyer(100_000, 40_000);
        expect(await exceeded(buyer, 60_000)).toBe(false);
        expect(await exceeded(buyer, 60_000.01)).toBe(true);
    });

    it('sums several open unconfirmed orders before the new one', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 30_000, { erpStatus: 'PENDING' });
        await h.addOrder(buyer, 30_000, { erpStatus: 'SENT_TO_ERP' });
        expect(await exceeded(buyer, 20_000)).toBe(false); // 80k
        await h.addOrder(buyer, 30_000, { erpStatus: 'RESERVED' });
        expect(await exceeded(buyer, 20_000)).toBe(true); // 110k
        expect(await exceeded(buyer, 10_000)).toBe(false); // exactly 100k
    });

    it('adds the open orders on top of the ERP credit balance', async () => {
        const buyer = await h.addBuyer(100_000, 50_000);
        await h.addOrder(buyer, 30_000);
        expect(await exceeded(buyer, 20_000)).toBe(false);
        expect(await exceeded(buyer, 20_000.01)).toBe(true);
    });

    it('ignores orders ERP already confirmed (they are in the balance) and dead payments', async () => {
        const buyer = await h.addBuyer(100_000);
        for (const erpStatus of ['SHIPPING', 'DELIVERING', 'DELIVERED', 'CANCELLED']) {
            await h.addOrder(buyer, 90_000, { erpStatus });
        }
        await h.addOrder(buyer, 90_000, { paymentState: 'Declined' });
        expect(await exceeded(buyer, 90_000)).toBe(false);
    });

    it.each(['CONFIRMED', 'UNDER_APPROVAL', 'APPROVED', 'PICKING'])(
        'still counts an order in %s (no sales document, debt not in the ERP balance yet)',
        async erpStatus => {
            const buyer = await h.addBuyer(100_000);
            await h.addOrder(buyer, 90_000, { erpStatus });
            expect(await exceeded(buyer, 20_000)).toBe(true);
        },
    );

    it('counts one order once however many payment attempts it has', async () => {
        const buyer = await h.addBuyer(100_000);
        const orderId = await h.addOrder(buyer, 60_000, { paymentState: 'Created' });
        await h.addPayment(orderId, 'online-stub', 'Created', 6_000_000);
        await h.addPayment(orderId, 'offline-terms', 'Created', 6_000_000);
        expect(await exceeded(buyer, 40_000)).toBe(false);
        expect(await exceeded(buyer, 40_000.01)).toBe(true);
    });

    it('counts only the unsettled remainder of a partially paid order', async () => {
        const buyer = await h.addBuyer(100_000);
        const orderId = await h.addOrder(buyer, 90_000, { paymentState: 'Created' });
        await h.addPayment(orderId, 'online-stub', 'Settled', 5_000_000);
        expect(await exceeded(buyer, 60_000)).toBe(false); // 40k + 60k
        expect(await exceeded(buyer, 60_000.01)).toBe(true);
    });

    it('counts an unpaid order of any form, ignores one already paid by money', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 30_000, { method: 'offline-terms' });
        await h.addOrder(buyer, 30_000, { method: 'cash', paymentState: 'Created' });
        await h.addOrder(buyer, 90_000, { method: 'online-stub', paymentState: 'Settled' });
        await h.addOrder(buyer, 90_000, { method: 'cash', paymentState: 'Settled' });
        expect(await exceeded(buyer, 40_000)).toBe(false); // 100k
        expect(await exceeded(buyer, 40_000.01)).toBe(true);
    });

    it('does not count a card order that opted out until its payment arrives', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 90_000, {
            method: 'online-stub',
            metadata: { placement: { route: 'after-payment', countsAgainstLimit: false } },
        });
        expect(await exceeded(buyer, 90_000)).toBe(false);
    });

    it('takes the placement of the latest live payment: a form change from bank transfer to card stops counting', async () => {
        const buyer = await h.addBuyer(100_000);
        const orderId = await h.addOrder(buyer, 90_000, {
            method: 'offline-terms',
            paymentState: 'Cancelled',
            metadata: { placement: { route: 'manager-confirmation', countsAgainstLimit: true } },
        });
        await h.addPayment(orderId, 'online-stub', 'Created', 9_000_000, {
            placement: { route: 'after-payment', countsAgainstLimit: false },
        });
        expect(await exceeded(buyer, 90_000)).toBe(false);
    });

    it('ignores the placement of a declined newer attempt and keeps the live one', async () => {
        const buyer = await h.addBuyer(100_000);
        const orderId = await h.addOrder(buyer, 90_000, {
            method: 'offline-terms',
            paymentState: 'Created',
            metadata: { placement: { route: 'manager-confirmation', countsAgainstLimit: true } },
        });
        await h.addPayment(orderId, 'online-stub', 'Declined', 9_000_000, {
            placement: { route: 'after-payment', countsAgainstLimit: false },
        });
        expect(await exceeded(buyer, 20_000)).toBe(true);
    });

    it('counts a legacy payment without a placement marker', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 90_000, { method: 'offline-terms', metadata: {} });
        expect(await exceeded(buyer, 20_000)).toBe(true);
    });

    it('never counts a cancelled order even if ERP has not confirmed it', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 90_000, { state: 'Cancelled' });
        expect(await exceeded(buyer, 90_000)).toBe(false);
    });

    it('stops counting an open order older than the max age (boundary and setting)', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(buyer, 90_000, { placedDaysAgo: 6 });
        expect(await exceeded(buyer, 20_000)).toBe(true);
        await h.run(`TRUNCATE payment, "order" RESTART IDENTITY`);
        await h.addOrder(buyer, 90_000, { placedDaysAgo: 8 });
        expect(await exceeded(buyer, 20_000)).toBe(false);
        h.state.maxAgeDays = 10;
        expect(await exceeded(buyer, 20_000)).toBe(true);
        h.state.maxAgeDays = null;
        expect(await exceeded(buyer, 20_000)).toBe(false);
    });

    it('excludes an order rejected by the ERP, and re-counts it once un-rejected', async () => {
        const buyer = await h.addBuyer(100_000);
        const orderId = await h.addOrder(buyer, 90_000, { erpStatus: 'REJECTED' });
        expect(await exceeded(buyer, 90_000)).toBe(false);
        await h.run(`UPDATE "order" SET "customFieldsErpstatus" = 'SENT_TO_ERP' WHERE id = $1`, [
            orderId,
        ]);
        expect(await exceeded(buyer, 20_000)).toBe(true);
    });

    it('does not count another counterparty’s open orders (data isolation)', async () => {
        const buyer = await h.addBuyer(100_000);
        await h.addOrder(await h.addBuyer(100_000), 95_000);
        expect(await exceeded(buyer, 90_000)).toBe(false);
    });

    it('does not count the order being placed itself (idempotent re-run)', async () => {
        const buyer = await h.addBuyer(100_000);
        const orderId = await h.addOrder(buyer, 70_000);
        expect(await exceeded(buyer, 70_000, 'cash', orderId)).toBe(false);
        expect(await exceeded(buyer, 70_000, 'cash', orderId)).toBe(false);
    });
});
