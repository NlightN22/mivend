import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { PriceTypeHandler } from '../../handlers/price-type.handler';

const ctx = {} as RequestContext;

function build() {
    const calls: { kind: string; set?: unknown; values?: unknown; where?: unknown }[] = [];
    const qb = () => {
        const call: (typeof calls)[number] = { kind: '' };
        calls.push(call);
        const chain = {
            update: () => ((call.kind = 'update'), chain),
            set: (v: unknown) => ((call.set = v), chain),
            where: (w: string, p: unknown) => ((call.where = [w, p]), chain),
            insert: () => ((call.kind = 'insert'), chain),
            into: () => chain,
            values: (v: unknown) => ((call.values = v), chain),
            orUpdate: () => chain,
            execute: vi.fn(async () => ({})),
        };
        return chain;
    };
    const connection = { getRepository: () => ({ manager: { createQueryBuilder: qb } }) };
    return { handler: new PriceTypeHandler(connection as never), calls };
}

describe('PriceTypeHandler', () => {
    it('upserts a customer type by code without touching the purchase flag of others', async () => {
        const { handler, calls } = build();
        await handler.upsert(ctx, { code: 'pt-a', name: 'A', visibility: 'customer' });
        expect(calls.map(c => c.kind)).toEqual(['insert']);
        expect(calls[0].values).toMatchObject({
            code: 'pt-a',
            visibility: 'customer',
            isPurchase: false,
            ceilingMultiplier: null,
        });
    });

    it('takes the purchase flag from any other type before upserting the purchase type', async () => {
        const { handler, calls } = build();
        await handler.upsert(ctx, {
            code: 'pt-buy',
            name: 'Buy',
            visibility: 'confidential',
            isPurchase: true,
            ceilingMultiplier: 1.5,
        });
        expect(calls.map(c => c.kind)).toEqual(['update', 'insert']);
        expect(calls[0].set).toEqual({ isPurchase: false, ceilingMultiplier: null });
        expect(calls[1].values).toMatchObject({ isPurchase: true, ceilingMultiplier: 1.5 });
    });

    it('rejects an unknown visibility instead of storing it', async () => {
        const { handler, calls } = build();
        await expect(
            handler.upsert(ctx, { code: 'x', name: 'X', visibility: 'public' as never }),
        ).rejects.toThrow(/unknown visibility/);
        expect(calls).toEqual([]);
    });
});
