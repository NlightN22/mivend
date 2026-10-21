import { expect, test } from '@playwright/test';
import { adminCall, superadminToken } from './price-type-access';
import {
    ACTORS,
    actorCredentials,
    actorState,
    actorToken,
    expectedIds,
    type ActorState,
} from './branch-actors';
import { expectedOrderIds, noteCount, sampleOrders, type SampleOrder } from './order-scope';

const ONE = `query($id: ID!) { order(id: $id) { id lines { id } history { totalItems } } }`;
const LIST = `query($ids: [String!]!) { orders(options: { take: 100, filter: { id: { in: $ids } } }) {
    totalItems items { id } } }`;
const RESERVATIONS = `query($id: ID!) { orderReservations(orderId: $id) { id } }`;
const NOTE = `mutation($id: ID!) { addNoteToOrder(input: { id: $id, note: "e2e-int scope probe", isPublic: false }) { id } }`;
// The same answer as for an id that does not exist, so a hidden order cannot be told from a missing one.
const NOT_FOUND = /No Order with the id "\d+" could be found|not found/i;

let superadmin: string;
let orders: SampleOrder[];

test.beforeAll(async () => {
    superadmin = await superadminToken();
    orders = sampleOrders();
    expect(orders.length, 'placed orders of at least two counterparty branches').toBeGreaterThan(1);
});

for (const actor of ACTORS) {
    test.describe(`13: orders for ${actor.key} (${actor.role}, ${actor.scope} scope)`, () => {
        let token: string;
        let state: ActorState;
        let expected: Set<string>;

        test.beforeAll(async () => {
            if (!actorCredentials(actor.key)) return;
            state = actorState(actor);
            expected = expectedOrderIds(actor, state, expectedIds(actor, state), orders);
            token = await actorToken(actor.key);
        });
        test.beforeEach(() => {
            test.skip(
                !actorCredentials(actor.key),
                `the ${actor.key} login is not set in the staging-integration env file`,
            );
        });

        test('by id, with lines and history, each order is visible exactly when its counterparty scope allows', async () => {
            if (actor.scope !== 'all')
                expect(
                    orders.some(o => !expected.has(o.id)),
                    'a hidden order exists for this actor',
                ).toBe(true);
            for (const order of orders) {
                const shown = expected.has(order.id);
                const result = await adminCall(token, ONE, { id: order.id });
                const got = (result.data as { order: { id: string } | null } | null)?.order ?? null;
                expect(got !== null, `${order.label}: order ${order.code}`).toBe(shown);
                if (shown) expect(result.errors).toEqual([]);
                else for (const e of result.errors) expect(e).toMatch(NOT_FOUND);
                if (!shown) {
                    const asSuperadmin = await adminCall(superadmin, ONE, { id: order.id });
                    expect(
                        (asSuperadmin.data as { order: unknown } | null)?.order,
                        `order ${order.code} exists for the superadmin`,
                    ).toBeTruthy();
                }
            }
        });

        test('the order list returns only the visible sample orders', async () => {
            const result = await adminCall(token, LIST, { ids: orders.map(o => o.id) });
            expect(result.errors).toEqual([]);
            const listed = (
                result.data as { orders: { totalItems: number; items: { id: string }[] } }
            ).orders;
            expect(listed.items.map(i => i.id).sort()).toEqual([...expected].sort());
            expect(listed.totalItems).toBe(expected.size);
        });

        test('a hidden order gives away nothing through reservations or a note', async () => {
            const hidden = orders.filter(o => !expected.has(o.id));
            test.skip(hidden.length === 0, 'the all-scope role has no hidden order');
            for (const order of hidden) {
                const reservations = await adminCall(token, RESERVATIONS, { id: order.id });
                expect(reservations.errors.join(' '), `reservations of ${order.code}`).toMatch(
                    NOT_FOUND,
                );
                const before = noteCount(order.id);
                const note = await adminCall(token, NOTE, { id: order.id });
                expect(note.errors.join(' '), `note on ${order.code}`).toMatch(
                    new RegExp(`${NOT_FOUND.source}|not currently authorized`, 'i'),
                );
                expect(noteCount(order.id), `no note written on ${order.code}`).toBe(before);
            }
        });
    });
}
