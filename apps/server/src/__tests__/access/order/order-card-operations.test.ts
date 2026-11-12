import { describe, expect, it } from 'vitest';

import { admin, DENIED, staffToken } from '../harness/actors';
import { ALL_KEYS, idOf } from '../counterparty/counterparty-queries';
import {
    ORDERS,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    VISIBLE_ORDERS,
    type ActorKey,
} from '../seed/fixture-plan';
import { NOT_FOUND, orderOf } from './order-queries';

const OVERDUE = `query($id: ID!) { counterpartyOverdue(counterpartyId: $id) { amount currency oldestDays } }`;
const RETRO = `query($id: ID!) { orderRetroBonus(orderId: $id) { hasRules lines { orderLineId } } }`;
const ADD = `mutation($o: ID!, $s: String!, $q: Int!) { addOrderLineBySku(orderId: $o, sku: $s, quantity: $q) }`;

const QUOTE = `query($o: ID!, $s: String!) { orderLineQuote(orderId: $o, sku: $s) { sku customerPrice } }`;

const hidden = (e: string): boolean => DENIED.test(e) || NOT_FOUND.test(e);

describe('counterpartyOverdue follows the credit right and the counterparty scope', () => {
    it.each(STAFF.map(s => s.key))(
        '%s sees overdue only of a counterparty it can see',
        async (key: ActorKey) => {
            const token = await staffToken(key);
            for (const counterparty of ALL_KEYS) {
                const result = await admin<{ counterpartyOverdue: { amount: number } | null }>(
                    token,
                    OVERDUE,
                    { id: idOf(counterparty) },
                );
                expect(result.errors, `${key} -> ${counterparty}`).toEqual([]);
                const answered = result.data!.counterpartyOverdue !== null;
                expect(answered, `${key} -> ${counterparty}`).toBe(
                    VISIBLE_COUNTERPARTIES[key].includes(counterparty),
                );
            }
        },
    );

    it('the all-scope director is never refused and gets an answer for every counterparty', async () => {
        const token = await staffToken('director');
        for (const counterparty of ALL_KEYS) {
            const result = await admin<{ counterpartyOverdue: unknown }>(token, OVERDUE, {
                id: idOf(counterparty),
            });
            expect(result.errors).toEqual([]);
            expect(result.data!.counterpartyOverdue).not.toBeNull();
        }
    });

    it('is refused without a staff session', async () => {
        const result = await admin(undefined as unknown as string, OVERDUE, { id: '1' });
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

describe('orderRetroBonus, orderLineQuote and addOrderLineBySku follow the order scope', () => {
    it.each(STAFF.map(s => s.key))(
        '%s gets no retro bonus rows for an order it cannot see',
        async (key: ActorKey) => {
            const token = await staffToken(key);
            for (const { key: orderKey } of ORDERS) {
                if (VISIBLE_ORDERS[key].includes(orderKey)) continue;
                const result = await admin<{
                    orderRetroBonus: { hasRules: boolean; lines: unknown[] };
                }>(token, RETRO, { id: orderOf(orderKey).id });
                expect(result.errors, `${key} -> ${counterparty}`).toEqual([]);
                expect(result.data!.orderRetroBonus).toEqual({ hasRules: false, lines: [] });
            }
        },
    );

    it.each(STAFF.map(s => s.key))(
        '%s cannot add a position to an order it cannot see',
        async (key: ActorKey) => {
            const token = await staffToken(key);
            for (const { key: orderKey } of ORDERS) {
                if (VISIBLE_ORDERS[key].includes(orderKey)) continue;
                const result = await admin(token, ADD, {
                    o: orderOf(orderKey).id,
                    s: 'ACCESS-SKU-1',
                    q: 1,
                });
                expect(result.errors.length, `${key} -> ${orderKey}`).toBeGreaterThan(0);
                for (const e of result.errors) expect(hidden(e)).toBe(true);
            }
        },
    );

    it.each(STAFF.map(s => s.key))(
        '%s cannot quote an article for an order it cannot see',
        async (key: ActorKey) => {
            const token = await staffToken(key);
            for (const { key: orderKey } of ORDERS) {
                if (VISIBLE_ORDERS[key].includes(orderKey)) continue;
                const result = await admin(token, QUOTE, {
                    o: orderOf(orderKey).id,
                    s: 'ACCESS-SKU-1',
                });
                expect(result.errors.length, `${key} -> ${orderKey}`).toBeGreaterThan(0);
                for (const e of result.errors) expect(hidden(e)).toBe(true);
            }
        },
    );

    it('all are refused without a staff session', async () => {
        const noToken = undefined as unknown as string;
        expect((await admin(noToken, RETRO, { id: '1' })).errors.length).toBeGreaterThan(0);
        expect((await admin(noToken, QUOTE, { o: '1', s: 'X' })).errors.length).toBeGreaterThan(0);
        expect((await admin(noToken, ADD, { o: '1', s: 'X', q: 1 })).errors.length).toBeGreaterThan(
            0,
        );
    });
});
