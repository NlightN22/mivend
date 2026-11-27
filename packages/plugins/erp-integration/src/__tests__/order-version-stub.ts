import type { RequestContext } from '@vendure/core';

// Runs the work as if no newer version were stored; the guard itself is covered against real Postgres.
export const passThroughOrderVersions = {
    apply: async (
        ctx: RequestContext,
        _erpOrderId: string,
        _stream: string,
        _version: string,
        work: (txCtx: RequestContext) => Promise<unknown>,
    ): Promise<{ stale: false; value: unknown }> => ({ stale: false, value: await work(ctx) }),
} as never;
