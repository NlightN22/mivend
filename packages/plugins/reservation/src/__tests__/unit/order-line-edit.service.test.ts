import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderLineEditService } from '../../order-line-edit.service';

const ctx = { activeUserId: 'admin-1' } as unknown as RequestContext;

interface Setup {
    erpStatus?: string | null;
    erpOrderId?: string | null;
    activeReservation?: boolean;
    settledPayments?: number;
    isExternal?: boolean;
    multiple?: number;
    lines?: Array<{ id: string; quantity: number }>;
    fitting?: Record<string, number>;
    submission?: 'none' | 'pending' | 'sent';
    skipped?: boolean;
    shipped?: boolean;
}

function build(setup: Setup = {}) {
    const lines = (setup.lines ?? [{ id: '1', quantity: 10 }]).map(l => ({
        ...l,
        productVariantId: 'v' + l.id,
        productVariant: { sku: 'sku-' + l.id },
        customFields: { organizationId: 7 },
    }));
    const order = {
        id: '5',
        state: 'PaymentAuthorized',
        customerId: 'c1',
        lines,
        customFields: {
            erpStatus: setup.erpStatus ?? null,
            erpOrderId: setup.erpOrderId ?? null,
            isExternal: setup.isExternal ?? false,
        },
    };
    const saved: unknown[] = [];
    const removed: unknown[] = [];
    const repo = (entity: { name: string }) => ({
        query: async () => undefined,
        count: async () => setup.settledPayments ?? 0,
        save: async (rows: unknown) => {
            saved.push({ entity: entity.name, rows });
            return rows;
        },
        remove: async (row: unknown) => {
            removed.push(row);
        },
    });
    const connection = {
        getRepository: (_c: unknown, entity: { name: string }) => repo(entity),
        withTransaction: async (c: unknown, work: (x: unknown) => unknown) => work(c),
    };
    const qb = {
        alias: 'o',
        andWhere: () => qb,
        getOne: async () => order,
    };
    const released = vi.fn(async () => 1);
    const skipPending = vi.fn(async () => setup.skipped ?? true);
    const editHook = vi.fn(async () => undefined);
    const orderChecks = { run: vi.fn(async () => undefined) };
    const orderService = {
        findOne: async () => order,
        applyPriceAdjustments: vi.fn(async () => order),
    };
    const history = { createHistoryEntryForOrder: vi.fn(async () => undefined) };
    const eventBus = { publish: vi.fn() };
    const service = new OrderLineEditService(
        connection as never,
        { buildVisibleOrdersQuery: async () => qb } as never,
        { dictionary: async () => ({ get: () => null }) } as never,
        {
            releaseReservations: released,
            findForOrder: async () =>
                setup.activeReservation ? [{ status: 'active' }] : [{ status: 'released' }],
        } as never,
        orderService as never,
        history as never,
        eventBus as never,
        { requiredMultiple: async () => setup.multiple ?? 1 } as never,
        {
            get: () => ({
                forOrder: async () =>
                    lines.map(l => ({
                        lineId: l.id,
                        needed: l.quantity,
                        available: setup.fitting?.[l.id] ?? l.quantity,
                        fitting: setup.fitting?.[l.id] ?? l.quantity,
                        limitedBy: 'warehouse',
                        warehouses: [],
                        organizations: [],
                    })),
            }),
        } as never,
        orderChecks as never,
        {
            get: () => ({
                submissionState: async () => setup.submission ?? 'none',
                skipPendingSubmission: skipPending,
            }),
        } as never,
        { afterLinesEdited: editHook } as never,
    );
    return {
        service,
        released,
        skipPending,
        editHook,
        orderChecks,
        orderService,
        history,
        eventBus,
        saved,
        removed,
        lines,
    };
}

describe('OrderLineEditService', () => {
    it('changes a quantity, recomputes prices and the on-edit checks, records history', async () => {
        const t = build();
        await t.service.setQuantity(ctx, '5', '1', 4);
        expect(t.lines[0].quantity).toBe(4);
        expect(t.orderService.applyPriceAdjustments).toHaveBeenCalled();
        expect(t.orderChecks.run).toHaveBeenCalledWith(expect.anything(), '5', 'on-edit');
        expect(t.history.createHistoryEntryForOrder).toHaveBeenCalled();
        expect(t.eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('rejects a quantity that breaks the pack multiple', async () => {
        const t = build({ multiple: 5 });
        await expect(t.service.setQuantity(ctx, '5', '1', 7)).rejects.toThrow(/multiples of 5/);
        expect(t.orderChecks.run).not.toHaveBeenCalled();
    });

    it.each([
        ['an order from the ERP', { isExternal: true }, /managed there/],
        ['an order already sent to the ERP', { submission: 'sent' }, /already sent/],
    ])('refuses to edit %s', async (_name, setup, message) => {
        const t = build(setup as Setup);
        await expect(t.service.setQuantity(ctx, '5', '1', 4)).rejects.toThrow(message);
        expect(t.lines[0].quantity).toBe(10);
    });

    it('allows an edit after payment was received', async () => {
        const t = build({ settledPayments: 1 });
        await t.service.setQuantity(ctx, '5', '1', 4);
        expect(t.lines[0].quantity).toBe(4);
    });

    it('releases an active reservation, skips the unsent confirmation and notifies the edit hook', async () => {
        const t = build({ activeReservation: true, submission: 'pending' });
        await t.service.setQuantity(ctx, '5', '1', 4);
        expect(t.skipPending).toHaveBeenCalled();
        expect(t.released).toHaveBeenCalled();
        expect(t.editHook).toHaveBeenCalledWith(expect.anything(), '5');
    });

    it('refuses when the pending confirmation was sent meanwhile', async () => {
        const t = build({ activeReservation: true, submission: 'pending', skipped: false });
        await expect(t.service.setQuantity(ctx, '5', '1', 4)).rejects.toThrow(/already sent/);
        expect(t.released).not.toHaveBeenCalled();
    });

    it('refuses to edit an order the ERP has registered', async () => {
        const t = build({ erpOrderId: 'erp-1' });
        await expect(t.service.setQuantity(ctx, '5', '1', 4)).rejects.toThrow(/already sent/);
    });

    it('refuses once the warehouse has started', async () => {
        const t = build({ erpStatus: 'picking' });
        (t.service as unknown as { statuses: unknown }).statuses = {
            dictionary: async () => ({
                get: () => ({ shipped: false, warehouseStarted: true, rejected: false }),
            }),
        };
        await expect(t.service.setQuantity(ctx, '5', '1', 4)).rejects.toThrow(/warehouse/);
    });

    it('refuses to remove the last line', async () => {
        const t = build();
        await expect(t.service.removeLine(ctx, '5', '1')).rejects.toThrow(/without lines/);
    });

    it('removes one of several lines', async () => {
        const t = build({
            lines: [
                { id: '1', quantity: 2 },
                { id: '2', quantity: 3 },
            ],
        });
        await t.service.removeLine(ctx, '5', '1');
        expect(t.removed).toHaveLength(1);
    });

    it('splits short lines, records shortfall, drops a line nothing fits for', async () => {
        const t = build({
            lines: [
                { id: '1', quantity: 10 },
                { id: '2', quantity: 6 },
                { id: '3', quantity: 4 },
            ],
            fitting: { '1': 4, '2': 0, '3': 4 },
        });
        const outcomes = await t.service.splitByStock(ctx, '5');
        expect(outcomes).toEqual([
            { lineId: '1', requested: 10, kept: 4, shortfall: 6 },
            { lineId: '2', requested: 6, kept: 0, shortfall: 6 },
        ]);
        const shortfalls = t.saved.find(
            s => (s as { entity: string }).entity === 'OrderLineShortfall',
        ) as {
            rows: Array<{ shortfallQuantity: number; administratorId: string }>;
        };
        expect(shortfalls.rows.map(r => r.shortfallQuantity)).toEqual([6, 6]);
        expect(shortfalls.rows[0].administratorId).toBe('admin-1');
        expect(t.removed).toHaveLength(1);
    });

    it('refuses a split when every line is covered or nothing would remain', async () => {
        await expect(build().service.splitByStock(ctx, '5')).rejects.toThrow(/already covered/);
        const t = build({ fitting: { '1': 0 } });
        await expect(t.service.splitByStock(ctx, '5')).rejects.toThrow(/without lines/);
    });
});
