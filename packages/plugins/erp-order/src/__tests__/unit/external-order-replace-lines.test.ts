import { describe, expect, it, Mock, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { batchedLinesSignature, externalLinesSignature } from '../../external-order-lines';
import { ExternalOrderService } from '../../external-order.service';
import type { ExternalOrderInput } from '../../external-order.types';

const ctx = {} as RequestContext;

function setup(current: Array<{ id: number; productVariantId: number; quantity: number }>): {
    service: ExternalOrderService;
    del: Mock;
    insertLines: Mock;
} {
    const del = vi.fn().mockImplementation(async (criteria: unknown[]) => {
        if (!criteria.length)
            throw new Error('Empty criteria(s) are not allowed for the delete method.');
    });
    const service = new ExternalOrderService(
        {
            getRepository: () => ({ find: vi.fn().mockResolvedValue(current), delete: del }),
        } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );
    const insertLines = vi.fn();
    (service as unknown as Record<string, unknown>).insertLines = insertLines;
    return { service, del, insertLines };
}

const input = {
    lines: [{ productVariantId: '5', quantity: 2, unitPriceMinor: 100 }],
} as unknown as ExternalOrderInput;

function replace(service: ExternalOrderService): Promise<void> {
    return (
        service as unknown as {
            replaceLinesIfChanged: (...a: unknown[]) => Promise<void>;
        }
    ).replaceLinesIfChanged(ctx, '1', input, new Map([['5', {}]]));
}

describe('ExternalOrderService replaceLinesIfChanged', () => {
    it('inserts lines for an order that has none without calling delete', async () => {
        const { service, del, insertLines } = setup([]);
        await replace(service);
        expect(del).not.toHaveBeenCalled();
        expect(insertLines).toHaveBeenCalledOnce();
    });

    it('deletes existing lines before inserting the changed ones', async () => {
        const { service, del, insertLines } = setup([{ id: 9, productVariantId: 7, quantity: 1 }]);
        await replace(service);
        expect(del).toHaveBeenCalledWith(['9']);
        expect(insertLines).toHaveBeenCalledOnce();
    });
});

describe('batchedLinesSignature', () => {
    it('matches the single-pass signature when lines span several batches', async () => {
        const rows = Array.from({ length: 2500 }, (_, n) => ({
            id: n + 1,
            productVariantId: n % 7,
            quantity: n + 1,
            listPrice: 100,
        }));
        const batches = (async function* () {
            for (let i = 0; i < rows.length; i += 1000) yield rows.slice(i, i + 1000);
        })();
        const { signature, ids } = await batchedLinesSignature(batches);
        expect(signature).toBe(
            externalLinesSignature(
                rows.map(r => ({
                    productVariantId: String(r.productVariantId),
                    quantity: r.quantity,
                    unitPriceMinor: r.listPrice,
                })),
            ),
        );
        expect(ids).toHaveLength(2500);
    });
});
