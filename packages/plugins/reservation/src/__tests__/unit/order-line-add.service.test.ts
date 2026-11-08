import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderLineAddService } from '../../order-line-add.service';

const ctx = {} as unknown as RequestContext;

function build(
    opts: {
        variant?: object | null;
        extra?: object[];
        multiple?: number;
        priced?: boolean;
        existing?: number;
    } = {},
) {
    const order = {
        id: '5',
        customerId: 'c1',
        customFields: { branchId: 'b1' },
        lines: [] as object[],
    };
    const line = { id: '9', quantity: opts.existing ?? 0 };
    const variant = opts.variant === undefined ? { id: '3', sku: 'SKU-1' } : opts.variant;
    const qb: Record<string, unknown> = {
        where: () => qb,
        andWhere: () => qb,
        getMany: async () => (variant ? [variant, ...(opts.extra ?? [])] : []),
    };
    qb.limit = () => qb;
    const connection = { getRepository: () => ({ createQueryBuilder: () => qb }) };
    const edits = {
        edit: vi.fn(
            async (
                c: unknown,
                _id: unknown,
                _kind: string,
                change: (c: unknown, o: unknown) => Promise<string | null>,
            ) => void (await change(c, order)),
        ),
        persist: vi.fn(async () => undefined),
    };
    const modifier = { getOrCreateOrderLine: vi.fn(async () => line) };
    const packaging = { requiredMultiple: vi.fn(async () => opts.multiple ?? 1) };
    const stockSync = { addQuantity: vi.fn(async () => undefined) };
    const service = new OrderLineAddService(
        connection as never,
        edits as never,
        modifier as never,
        packaging as never,
        stockSync as never,
        {
            get: () => ({ hasCustomerPrice: async () => opts.priced ?? true }),
        } as never,
    );
    return { service, edits, modifier, stockSync, line };
}

describe('OrderLineAddService', () => {
    it('adds the quantity to the line of the exact article and persists through the shared edit path', async () => {
        const t = build();
        await t.service.addBySku(ctx, '5', ' SKU-1 ', 3);
        expect(t.edits.edit).toHaveBeenCalledWith(ctx, '5', 'add', expect.any(Function));
        expect(t.stockSync.addQuantity).toHaveBeenCalledWith(ctx, expect.anything(), t.line, 3);
        expect(t.line.quantity).toBe(3);
        expect(t.edits.persist).toHaveBeenCalled();
    });

    it('refuses an unknown article without touching the order', async () => {
        const t = build({ variant: null });
        await expect(t.service.addBySku(ctx, '5', 'NOPE', 1)).rejects.toThrow(/No product/);
        expect(t.modifier.getOrCreateOrderLine).not.toHaveBeenCalled();
    });

    it('refuses an article the customer has no price for', async () => {
        const t = build({ priced: false });
        await expect(t.service.addBySku(ctx, '5', 'SKU-1', 1)).rejects.toThrow(/no price/);
        expect(t.modifier.getOrCreateOrderLine).not.toHaveBeenCalled();
    });

    it('refuses an article that matches more than one product', async () => {
        const t = build({ extra: [{ id: '4', sku: 'SKU-1' }] });
        await expect(t.service.addBySku(ctx, '5', 'SKU-1', 1)).rejects.toThrow(/more than one/);
        expect(t.modifier.getOrCreateOrderLine).not.toHaveBeenCalled();
    });

    it('caps the resulting line quantity, not only the added one', async () => {
        const t = build({ existing: 999_999 });
        await expect(t.service.addBySku(ctx, '5', 'SKU-1', 2)).rejects.toThrow(/at most/);
        expect(t.stockSync.addQuantity).not.toHaveBeenCalled();
    });

    it('refuses a quantity that breaks the pack multiple', async () => {
        const t = build({ multiple: 4 });
        await expect(t.service.addBySku(ctx, '5', 'SKU-1', 3)).rejects.toThrow(/multiples of 4/);
    });

    it.each([0, -1, 1.5])('refuses quantity %s before any lock is taken', async quantity => {
        const t = build();
        await expect(t.service.addBySku(ctx, '5', 'SKU-1', quantity)).rejects.toThrow(
            /whole number/,
        );
        expect(t.edits.edit).not.toHaveBeenCalled();
    });

    it('refuses a blank article', async () => {
        const t = build();
        await expect(t.service.addBySku(ctx, '5', '  ', 1)).rejects.toThrow(/article/);
    });
});
