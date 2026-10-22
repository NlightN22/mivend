import { beforeAll, describe, expect, it } from 'vitest';

import { admin, seed, staff, staffToken } from '../harness/actors';
import { DENIED_OR_MISSING, proformaStatus } from '../proforma/proforma-queries';
import {
    ORDERS,
    STAFF,
    VISIBLE_PAYMENTS,
    type ActorKey,
    type PaymentKey,
} from '../seed/fixture-plan';
import type { SeedPayment } from '../seed/orders-seed';

const PROFORMAS = `query($cp: ID!) { visibleProformaInvoices(counterpartyId: $cp, options: { take: 200 }) {
    items { id } } }`;
const PAYMENTS = `query($cp: ID!) { visiblePayments(counterpartyId: $cp, options: { take: 200 }) {
    totalItems items { id } } }`;
const REFUND = `mutation($p: ID!, $r: String!) { recordPaymentRefund(paymentId: $p, amount: 1,
    reason: "access denied probe", providerRefundId: $r) { id } }`;
const REFUND_EXISTS = `query($r: String!) { paymentRefundExists(providerRefundId: $r) }`;
const WITHDRAW = `mutation($id: ID!) { withdrawProformaInvoice(id: $id) { id status } }`;

const KEYS: PaymentKey[] = ['a-own-paid', 'b-own'];
const counterpartyOf = (key: PaymentKey): string =>
    seed().counterparties[ORDERS.find(o => o.key === key)!.counterparty];
const sample = (key: PaymentKey): SeedPayment => seed().ordering.payments[key];

async function refundExists(marker: string): Promise<boolean> {
    const result = await admin<{ paymentRefundExists: boolean }>(
        await staffToken('superadmin'),
        REFUND_EXISTS,
        { r: marker },
    );
    expect(result.errors).toEqual([]);
    return result.data!.paymentRefundExists;
}

async function seen(
    token: string,
    key: PaymentKey,
): Promise<{ proforma: boolean; payment: boolean }> {
    const cp = counterpartyOf(key);
    const p = await admin<{ visibleProformaInvoices: { items: { id: string }[] } }>(
        token,
        PROFORMAS,
        { cp },
    );
    const pay = await admin<{ visiblePayments: { items: { id: string }[] } }>(token, PAYMENTS, {
        cp,
    });
    expect([...p.errors, ...pay.errors]).toEqual([]);
    return {
        proforma: p.data!.visibleProformaInvoices.items.some(i => i.id === sample(key).proforma.id),
        payment: pay.data!.visiblePayments.items.some(i => i.id === sample(key).id),
    };
}

it('the superadmin sees both payments, their proformas and refunds', async () => {
    const superadmin = await staffToken('superadmin');
    for (const key of KEYS) {
        expect(await seen(superadmin, key), key).toEqual({ proforma: true, payment: true });
        expect(await refundExists(sample(key).refundMarker), 'the seeded refund').toBe(true);
    }
});

describe.each(STAFF.map(s => s.key))('payments for %s', (key: ActorKey) => {
    let token: string;
    const expected = new Set(VISIBLE_PAYMENTS[key]);

    beforeAll(async () => {
        token = await staffToken(key);
    });

    it('proformas and payments follow the order scope; a refund is superadmin only', async () => {
        // operator-a's standing grant over manager-b covers b-own, so it sees both payments.
        if (staff(key).scope !== 'all' && key !== 'operator-a')
            expect(
                KEYS.some(k => !expected.has(k)),
                'a hidden payment',
            ).toBe(true);
        for (const k of KEYS) {
            const shown = expected.has(k);
            expect(await seen(token, k), k).toEqual({ proforma: shown, payment: shown });
            const marker = `access-denied-refund-${key}-${k}`;
            const refund = await admin(token, REFUND, { p: sample(k).id, r: marker });
            expect(refund.errors.join(' '), 'recordPaymentRefund').toMatch(DENIED_OR_MISSING);
            expect(await refundExists(marker), 'no refund written').toBe(false);
            if (shown) continue;
            const number = sample(k).proforma.number;
            const status = await proformaStatus(number);
            const withdraw = await admin(token, WITHDRAW, { id: sample(k).proforma.id });
            expect(withdraw.errors.join(' '), `withdraw ${number}`).toMatch(DENIED_OR_MISSING);
            expect(await proformaStatus(number)).toBe(status);
        }
    });
});
