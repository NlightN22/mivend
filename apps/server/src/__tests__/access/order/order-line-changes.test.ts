import { describe, expect, it } from 'vitest';

import { admin, seed, staffToken } from '../harness/actors';
import { STAFF, type ActorKey } from '../seed/fixture-plan';

const LIST = `query { visibleOrders(options: { take: 1000 }) { items { id lineChanges { orderLineId } soldTotalWithTax } } }`;
const ONE = `query($id: ID!) { order(id: $id) { id lineChanges { orderLineId } soldTotalWithTax } }`;

type Row = { id: string; lineChanges: unknown[]; soldTotalWithTax: number | null };

describe('Order.lineChanges and soldTotalWithTax follow the order scope', () => {
    it.each(STAFF.map(s => s.key))(
        '%s resolves the fields on every visible order',
        async (key: ActorKey) => {
            const r = await admin<{ visibleOrders: { items: Row[] } }>(await staffToken(key), LIST);
            expect(r.errors).toEqual([]);
            const withDocuments = [
                seed().ordering.orders['a-own'].id,
                seed().ordering.orders['b-own'].id,
            ];
            for (const row of r.data!.visibleOrders.items) {
                if (!withDocuments.includes(row.id)) expect(row.lineChanges).toEqual([]);
            }
        },
    );

    it('an order outside the caller scope stays unreachable through the new fields', async () => {
        const all = await admin<{ visibleOrders: { items: Row[] } }>(
            await staffToken('superadmin'),
            LIST,
        );
        const ids = all.data!.visibleOrders.items.map(o => o.id);
        for (const key of STAFF.map(s => s.key)) {
            const visible = await admin<{ visibleOrders: { items: Row[] } }>(
                await staffToken(key),
                LIST,
            );
            const own = new Set(visible.data!.visibleOrders.items.map(o => o.id));
            for (const id of ids.filter(i => !own.has(i))) {
                const r = await admin<{ order: Row | null }>(await staffToken(key), ONE, { id });
                expect(r.data?.order ?? null).toBeNull();
            }
        }
    });

    it('is refused without a staff session', async () => {
        const r = await admin(undefined as unknown as string, LIST);
        expect(r.errors?.length).toBeGreaterThan(0);
    });
});
