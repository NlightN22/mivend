import { describe, it, expect, vi } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';

import { ActiveOrderSettleInterceptor } from '../../active-order-settle.interceptor';

vi.mock('@nestjs/graphql', () => ({
    GqlExecutionContext: {
        create: (c: { fieldName: string }) => ({
            getInfo: () => ({ fieldName: c.fieldName }),
            getContext: () => ({ req: {} }),
        }),
    },
}));

const run = async (fieldName: string, fromRequest: () => Promise<unknown>) => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const interceptor = new ActiveOrderSettleInterceptor(
        { fromRequest } as never,
        { waitForSettled: wait } as never,
    );
    const next = { handle: vi.fn().mockReturnValue('stream') } as unknown as CallHandler;
    const ctx = { getType: () => 'graphql', fieldName } as unknown as ExecutionContext;
    const out = await interceptor.intercept(ctx, next);
    return { wait, out };
};

describe('ActiveOrderSettleInterceptor', () => {
    it('waits for the session active order on activeOrder', async () => {
        const { wait, out } = await run('activeOrder', async () => ({
            session: { activeOrderId: 7 },
        }));
        expect(wait).toHaveBeenCalledWith(7, 3000);
        expect(out).toBe('stream');
    });

    it('does not wait for other fields', async () => {
        const { wait } = await run('products', async () => ({ session: { activeOrderId: 7 } }));
        expect(wait).not.toHaveBeenCalled();
    });

    it('never throws when the context cannot be built', async () => {
        const { out } = await run('activeOrder', async () => {
            throw new Error('x');
        });
        expect(out).toBe('stream');
    });
});
