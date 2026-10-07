import { describe, it, expect, vi } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';

import { ActiveOrderSettleInterceptor } from '../../active-order-settle.interceptor';

vi.mock('@nestjs/graphql', () => ({
    GqlExecutionContext: {
        create: (c: { fieldName: string; req: unknown }) => ({
            getInfo: () => ({ fieldName: c.fieldName }),
            getContext: () => ({ req: c.req }),
        }),
    },
}));

const run = async (
    fieldName: string,
    req: unknown,
    getSessionFromToken: () => Promise<unknown>,
) => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const interceptor = new ActiveOrderSettleInterceptor(
        { getSessionFromToken } as never,
        { authOptions: { authTokenHeaderKey: 'vendure-auth-token' } } as never,
        { waitForSettled: wait } as never,
    );
    const next = { handle: vi.fn().mockReturnValue('stream') } as unknown as CallHandler;
    const ctx = { getType: () => 'graphql', fieldName, req } as unknown as ExecutionContext;
    const out = await interceptor.intercept(ctx, next);
    return { wait, out };
};

const session = async () => ({ activeOrderId: 7 });

describe('ActiveOrderSettleInterceptor', () => {
    it('waits for the session active order on activeOrder (cookie token)', async () => {
        const { wait, out } = await run('activeOrder', { session: { token: 't' } }, session);
        expect(wait).toHaveBeenCalledWith(7, 8000);
        expect(out).toBe('stream');
    });

    it('reads a bearer token from the authorization header', async () => {
        const getSession = vi.fn(session);
        await run('activeOrder', { headers: { authorization: 'Bearer abc' } }, getSession);
        expect(getSession).toHaveBeenCalledWith('abc');
    });

    it('does not wait for other fields', async () => {
        const { wait } = await run('products', { session: { token: 't' } }, session);
        expect(wait).not.toHaveBeenCalled();
    });

    it('does not wait without a token or session', async () => {
        const noToken = await run('activeOrder', {}, session);
        expect(noToken.wait).not.toHaveBeenCalled();
        const noSession = await run(
            'activeOrder',
            { session: { token: 't' } },
            async () => undefined,
        );
        expect(noSession.wait).not.toHaveBeenCalled();
    });

    it('never throws when the session lookup fails', async () => {
        const { out } = await run('activeOrder', { session: { token: 't' } }, async () => {
            throw new Error('x');
        });
        expect(out).toBe('stream');
    });
});
