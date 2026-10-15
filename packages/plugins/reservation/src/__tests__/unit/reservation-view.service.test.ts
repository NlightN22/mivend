import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { loadLineFlags } from '../../reservation-line-flags';
import { ReservationViewService } from '../../reservation-view.service';

describe('loadLineFlags', () => {
    it('costs a constant number of queries for an order of 50 lines', async () => {
        const lines = Array.from({ length: 50 }, (_, i) => ({
            id: String(i + 1),
            orderId: '1',
            variantId: String(i + 1),
            quantity: 1,
            state: 'PaymentAuthorized',
        }));
        const query = vi.fn(async (sql: string) => {
            if (sql.includes('FROM order_line')) return lines;
            if (sql.includes('FROM reservation')) return [{ id: '1', until: new Date(1000) }];
            return [{ orderId: '1', productVariantId: '2', until: new Date(500), quantity: 1 }];
        });

        const flags = await loadLineFlags(
            query,
            lines.map(l => l.id),
        );

        expect(query).toHaveBeenCalledTimes(3);
        expect(flags.get('1')).toEqual({ reserved: true, reservedUntil: new Date(1000) });
        expect(flags.get('2')).toEqual({ reserved: true, reservedUntil: new Date(500) });
        expect(flags.get('3')).toEqual({ reserved: false, reservedUntil: null });
    });

    it('never reserves a line of a cancelled order', async () => {
        const query = vi.fn(async (sql: string) =>
            sql.includes('FROM order_line')
                ? [{ id: '1', orderId: '1', variantId: '1', quantity: 1, state: 'Cancelled' }]
                : [{ id: '1', until: new Date(1000), orderId: '1', productVariantId: '1' }],
        );
        expect((await loadLineFlags(query, ['1'])).get('1')?.reserved).toBe(false);
    });
});

describe('ReservationViewService.holders', () => {
    const ctx = {} as RequestContext;

    function create(pages: Array<Array<{ orderId: string }>>, visible: Set<string>) {
        const query = vi.fn(async () => pages.shift() ?? []);
        const connection = { rawConnection: { query } };
        const visibility = {
            buildVisibleOrdersQuery: async () => {
                const qb = {
                    alias: 'o',
                    ids: [] as string[],
                    andWhere: (_s: string, p: { ids: string[] }) => ((qb.ids = p.ids), qb),
                    select: () => qb,
                    getMany: async () => qb.ids.filter(id => visible.has(id)).map(id => ({ id })),
                };
                return qb;
            },
        };
        return {
            service: new ReservationViewService(connection as never, visibility as never),
            query,
        };
    }

    const row = (orderId: string) => ({
        orderId,
        orderCode: `C-${orderId}`,
        source: 'LOCAL',
        quantity: 1,
        until: null,
        counterpartyName: null,
        managerName: '',
    });

    it('applies visibility before limiting: a visible holder behind a full page of foreign ones is listed', async () => {
        const foreign = Array.from({ length: 200 }, (_, i) => row(`f${i}`));
        const { service, query } = create([foreign, [row('mine')]], new Set(['mine']));

        const holders = await service.holders(ctx, 10);

        expect(holders.map(h => h.orderId)).toEqual(['mine']);
        expect(query).toHaveBeenCalledTimes(2);
    });

    it("shows nothing of another counterparty's orders", async () => {
        const { service } = create([[row('x1'), row('x2')]], new Set());
        expect(await service.holders(ctx, 10)).toEqual([]);
    });

    it("returns no details of another counterparty's order", async () => {
        const { service, query } = create([], new Set());
        expect(await service.details(ctx, 5)).toEqual([]);
        expect(query).not.toHaveBeenCalled();
    });
});
