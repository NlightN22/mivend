import { describe, expect, it, vi } from 'vitest';

import { ActingContextService } from '../../acting-context.service';

function setup(rows: unknown[]) {
    const query = vi.fn().mockResolvedValue(rows);
    const service = new ActingContextService({ getRepository: () => ({ query }) } as never);
    return { service, query };
}

describe('ActingContextService', () => {
    it('reads the acting flag and session point from the session row', async () => {
        const { service } = setup([{ administratorId: '7', tradingPointId: '12' }]);
        const ctx = { session: { token: 't' } } as never;

        expect(await service.get(ctx)).toEqual({ administratorId: '7', tradingPointId: '12' });
    });

    it('is null for an ordinary session and for a request without a session', async () => {
        expect(
            await setup([{ administratorId: null, tradingPointId: null }]).service.get({
                session: { token: 't' },
            } as never),
        ).toBeNull();
        expect(await setup([]).service.get({} as never)).toBeNull();
    });

    it('queries once per request however many lines ask', async () => {
        const { service, query } = setup([{ administratorId: '7', tradingPointId: null }]);
        const ctx = { session: { token: 't' } } as never;

        await Promise.all([service.get(ctx), service.get(ctx), service.get(ctx)]);

        expect(query).toHaveBeenCalledTimes(1);
    });

    it('sees a point change made earlier in the same request', async () => {
        const { service, query } = setup([{ administratorId: '7', tradingPointId: null }]);
        const ctx = { session: { token: 't' } } as never;
        await service.get(ctx);

        await service.setTradingPoint(ctx, '12');
        await service.get(ctx);

        expect(query).toHaveBeenCalledTimes(3);
    });
});
