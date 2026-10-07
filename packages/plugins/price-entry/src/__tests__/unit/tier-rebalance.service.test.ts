import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OrderLineEvent, RequestContext } from '@vendure/core';

import { TierRebalanceService } from '../../tier-rebalance.service';

type Handler = (e: OrderLineEvent) => Promise<void>;

function makeCtx(): RequestContext {
    const ctx = { copy: () => makeCtx() };
    return ctx as unknown as RequestContext;
}

describe('TierRebalanceService', () => {
    let handler: Handler;
    let lines: Record<string, Array<{ id: number; quantity: number }>>;
    let adjust: ReturnType<typeof vi.fn>;
    let applyPrices: ReturnType<typeof vi.fn>;
    let service: TierRebalanceService;

    const fire = (orderId: number, lineId: number, ctx = makeCtx()): Promise<void> =>
        handler({
            type: 'updated',
            ctx,
            order: { id: orderId },
            orderLine: { id: lineId },
        } as unknown as OrderLineEvent);

    beforeEach(() => {
        lines = {
            '1': [
                { id: 10, quantity: 1 },
                { id: 11, quantity: 2 },
            ],
            '2': [
                { id: 20, quantity: 1 },
                { id: 21, quantity: 1 },
            ],
        };
        adjust = vi.fn().mockResolvedValue({});
        applyPrices = vi.fn().mockResolvedValue({});
        const eventBus = {
            ofType: () => ({
                subscribe: (cb: (e: OrderLineEvent) => unknown) => {
                    handler = async e => {
                        await cb(e);
                    };
                    return { unsubscribe: () => undefined };
                },
            }),
        };
        const orderService = {
            adjustOrderLine: adjust,
            findOne: vi.fn().mockResolvedValue({ id: 1, lines: [] }),
            applyPriceAdjustments: applyPrices,
        };
        const connection = {
            getRepository: () => ({
                findOne: ({ where }: { where: { id: number } }) =>
                    Promise.resolve({ id: where.id, lines: lines[String(where.id)] }),
            }),
        };
        service = new TierRebalanceService(
            eventBus as never,
            orderService as never,
            connection as never,
        );
        service.onApplicationBootstrap();
    });

    it('rebalances siblings only and refreshes totals once', async () => {
        await fire(1, 10);
        expect(adjust).toHaveBeenCalledTimes(1);
        expect(adjust.mock.calls[0].slice(1)).toEqual([1, 11, 2]);
        expect(applyPrices).toHaveBeenCalledTimes(1);
    });

    it('runs another pass when an event arrives during a rebalance', async () => {
        let release!: () => void;
        adjust.mockImplementationOnce(() => new Promise(r => (release = () => r({}))));
        const first = fire(1, 10);
        await vi.waitFor(() => expect(adjust).toHaveBeenCalledTimes(1));
        await fire(1, 11);
        release();
        await first;
        expect(adjust.mock.calls.map(c => c[2])).toEqual([11, 10]);
        expect(applyPrices).toHaveBeenCalledTimes(1);
    });

    it('ignores events fired by its own adjustOrderLine calls', async () => {
        adjust.mockImplementation(async (ctx: RequestContext) => {
            await fire(1, 11, ctx);
            return {};
        });
        await fire(1, 10);
        expect(adjust).toHaveBeenCalledTimes(1);
    });

    it('bounds the number of passes under a constant event stream', async () => {
        adjust.mockImplementation(async () => {
            await fire(1, 10);
            return {};
        });
        await fire(1, 11);
        expect(adjust.mock.calls.length).toBeLessThanOrEqual(8);
        expect(applyPrices).toHaveBeenCalledTimes(1);
    });

    it('releases the guard when a line adjustment fails', async () => {
        adjust.mockRejectedValueOnce(new Error('boom'));
        await fire(1, 10);
        adjust.mockClear();
        await fire(1, 10);
        expect(adjust).toHaveBeenCalledTimes(1);
    });

    it('keeps orders isolated', async () => {
        let release!: () => void;
        adjust.mockImplementationOnce(() => new Promise(r => (release = () => r({}))));
        const first = fire(1, 10);
        await vi.waitFor(() => expect(adjust).toHaveBeenCalledTimes(1));
        await fire(2, 20);
        expect(adjust.mock.calls.map(c => c[1])).toEqual([1, 2]);
        release();
        await first;
        expect(applyPrices).toHaveBeenCalledTimes(2);
    });
});
