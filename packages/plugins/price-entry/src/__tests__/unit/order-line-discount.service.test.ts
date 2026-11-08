import { describe, it, expect, vi } from 'vitest';
import { UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { OrderLineDiscountService } from '../../order-line-discount.service';
import type { LineDiscount } from '../../line-discount.service';

const ctx = {} as RequestContext;

function discount(over: Partial<LineDiscount>): LineDiscount {
    return {
        lineId: '1',
        productErpId: 'p1',
        reference: 100,
        effective: 80,
        percent: 20,
        manual: true,
        ...over,
    };
}

function build(states: LineDiscount[], ceiling: number | null = null) {
    const line = { id: 1, customFields: {}, productVariant: { sku: 'A' } };
    const lineEdit = {
        edit: vi.fn(
            async (
                c: unknown,
                _o: unknown,
                _k: unknown,
                change: (c: unknown, o: unknown) => Promise<string | null>,
            ) => {
                await change(c, { lines: [line] });
            },
        ),
        lineOf: vi.fn(() => line),
        persist: vi.fn(async () => undefined),
    };
    const lineDiscounts = {
        forOrder: vi.fn(async () => [states.shift() ?? discount({})]),
    };
    const service = new OrderLineDiscountService(
        lineEdit as never,
        { findOne: vi.fn(async () => ({ lines: [line] })) } as never,
        lineDiscounts as never,
        {
            ceilingsForProducts: vi.fn(async () => new Map([['p1', ceiling]])),
            actorAdministratorId: vi.fn(async () => '7'),
        } as never,
    );
    return { service, lineEdit, line };
}

describe('OrderLineDiscountService.reduce', () => {
    it('refuses a deeper discount without touching the line', async () => {
        const { service, lineEdit, line } = build([discount({ effective: 80 })]);
        await expect(service.reduce(ctx, 'o', '1', 79)).rejects.toBeInstanceOf(UserInputError);
        expect(lineEdit.persist).not.toHaveBeenCalled();
        expect(line.customFields).toEqual({});
    });

    it('does nothing when the price stays as it is', async () => {
        const { service, lineEdit } = build([discount({ effective: 80 })]);
        await service.reduce(ctx, 'o', '1', 80);
        expect(lineEdit.persist).not.toHaveBeenCalled();
    });

    it('sets a manual price higher than the current one with the reason', async () => {
        const { service, lineEdit, line } = build([
            discount({ effective: 80 }),
            discount({ effective: 90 }),
        ]);
        await service.reduce(ctx, 'o', '1', 90, 'customer asked');
        expect(line.customFields).toEqual({
            manualUnitPrice: 90,
            manualPriceReason: 'customer asked',
        });
        expect(lineEdit.persist).toHaveBeenCalledOnce();
    });

    it('fails (rolling the edit back) when the recalculated price ended lower than before', async () => {
        const { service } = build([discount({ effective: 80 }), discount({ effective: 70 })]);
        await expect(service.reduce(ctx, 'o', '1', 90)).rejects.toBeInstanceOf(UserInputError);
    });

    it('rejects a non-integer or negative price before any edit', async () => {
        const { service, lineEdit } = build([]);
        expect(() => service.reduce(ctx, 'o', '1', 1.5)).toThrow(UserInputError);
        expect(() => service.reduce(ctx, 'o', '1', -1)).toThrow(UserInputError);
        expect(lineEdit.edit).not.toHaveBeenCalled();
    });
});

describe('OrderLineDiscountService.revert', () => {
    it('does nothing for a line that is already automatic', async () => {
        const { service, lineEdit } = build([discount({ manual: false })]);
        await service.revert(ctx, 'o', '1');
        expect(lineEdit.persist).not.toHaveBeenCalled();
    });

    it('clears the manual price when the automatic price gives no more discount', async () => {
        const { service, line } = build([
            discount({ effective: 80 }),
            discount({ effective: 90, manual: false }),
        ]);
        await service.revert(ctx, 'o', '1');
        expect(line.customFields).toEqual({ manualUnitPrice: null, manualPriceReason: null });
    });

    it('refuses a bigger automatic discount when no limit is set', async () => {
        const { service } = build([
            discount({ effective: 80 }),
            discount({ effective: 60, manual: false }),
        ]);
        await expect(service.revert(ctx, 'o', '1')).rejects.toBeInstanceOf(UserInputError);
    });

    it('allows a bigger automatic discount inside the limit and refuses it outside', async () => {
        const inside = build(
            [discount({ effective: 80 }), discount({ effective: 70, manual: false })],
            30,
        );
        await expect(inside.service.revert(ctx, 'o', '1')).resolves.toBeUndefined();
        const outside = build(
            [discount({ effective: 80 }), discount({ effective: 60, manual: false })],
            30,
        );
        await expect(outside.service.revert(ctx, 'o', '1')).rejects.toBeInstanceOf(UserInputError);
    });
});
