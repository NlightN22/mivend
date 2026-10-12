import { describe, expect, it } from 'vitest';
import { OrderModifier } from '@vendure/core';
import type { Order, OrderLine, RequestContext } from '@vendure/core';

// Vendure's real OrderModifier merge check (#221). Defs mirror the runtime OrderLine custom fields
// (acquiring's organizationId, price-entry's manual price pair); the full app is not bootstrapped.
const RUNTIME_LINE_FIELDS = [
    { name: 'manualUnitPrice', type: 'int', nullable: true },
    { name: 'manualPriceReason', type: 'string', nullable: true },
    { name: 'organizationId', type: 'int', nullable: true },
];

type ModifierCtor = new (...args: unknown[]) => OrderModifier;

function modifierWith(
    lineFields: Array<{ name: string; type: string; nullable: boolean }>,
): OrderModifier {
    const configService = { customFields: { OrderLine: lineFields } };
    return new (OrderModifier as unknown as ModifierCtor)({}, configService);
}

const ctx = {} as RequestContext;
const cartWith = (customFields: Record<string, unknown>): Order =>
    ({
        lines: [{ id: 7, productVariantId: 42, quantity: 3, customFields } as unknown as OrderLine],
    }) as Order;
const plainLine = { manualUnitPrice: null, manualPriceReason: null, organizationId: null };

describe('addItemToOrder line merge with the runtime OrderLine custom fields', () => {
    it('merges a second add of the same variant into the existing line', async () => {
        const line = await modifierWith(RUNTIME_LINE_FIELDS).getExistingOrderLine(
            ctx,
            cartWith(plainLine),
            42,
            undefined,
        );

        expect(line?.id).toBe(7);
    });

    it('keeps a different variant on its own line', async () => {
        const line = await modifierWith(RUNTIME_LINE_FIELDS).getExistingOrderLine(
            ctx,
            cartWith(plainLine),
            43,
            undefined,
        );

        expect(line).toBeUndefined();
    });

    it('would never merge with an immutable uuid among the line custom fields', async () => {
        const withUuid = [...RUNTIME_LINE_FIELDS, { name: 'uuid', type: 'string', nullable: true }];
        const line = await modifierWith(withUuid).getExistingOrderLine(
            ctx,
            cartWith({ ...plainLine, uuid: 'line-uuid' }),
            42,
            undefined,
        );

        expect(line).toBeUndefined();
    });
});
