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
    let blocking: Handler;
    let lines: Record<string, Array<{ id: number; quantity: number }>>;
    let adjust: ReturnType<typeof vi.fn>;
    let applyPrices: ReturnType<typeof vi.fn>;
    let findOneOrder: ReturnType<typeof vi.fn>;
    let order: string[];
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
        order = [];
        findOneOrder = vi.fn().mockResolvedValue({ id: 1, lines: [] });
        adjust = vi.fn().mockResolvedValue({});
        applyPrices = vi.fn(async () => {
            order.push('apply');
            return {};
        });
        const eventBus = {
            registerBlockingEventHandler: (o: { handler: Handler }) => {
                blocking = o.handler;
            },
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
            findOne: findOneOrder,
            applyPriceAdjustments: applyPrices,
        };
        const queryBuilder = {
            setLock: vi.fn(() => queryBuilder),
            where: vi.fn(() => queryBuilder),
            select: vi.fn(() => queryBuilder),
            getOne: vi.fn(async () => {
                order.push('lock');
                return { id: 1 };
            }),
        };
        const connection = {
            withTransaction: (_ctx: unknown, work: (c: unknown) => Promise<unknown>) => work({}),
            getRepository: () => ({
                createQueryBuilder: () => queryBuilder,
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

    it('locks the order row before each sibling adjustment and before recomputing totals', async () => {
        adjust.mockImplementation(async () => {
            order.push('adjust');
            return {};
        });
        await fire(1, 10);
        expect(order).toEqual(['lock', 'adjust', 'lock', 'apply']);
    });

    it('loads the relations Vendure needs to recompute totals, surcharges included', async () => {
        await fire(1, 10);
        expect(findOneOrder.mock.calls[0][2]).toEqual(
            expect.arrayContaining([
                'lines',
                'lines.productVariant',
                'shippingLines',
                'surcharges',
            ]),
        );
    });

    it('still refreshes totals when a sibling line adjustment fails', async () => {
        adjust.mockRejectedValue(new Error('order-does-not-contain-line-with-id'));
        await fire(1, 10);
        expect(applyPrices).toHaveBeenCalledTimes(1);
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
        expect(applyPrices).toHaveBeenCalledTimes(2);
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
        expect(applyPrices).toHaveBeenCalledTimes(4);
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

    describe('waitForSettled', () => {
        it('returns immediately when nothing is pending', async () => {
            await service.waitForSettled(1, 50);
        });

        it('waits for the marker set by the blocking handler until the rebalance ends', async () => {
            await blocking({
                type: 'updated',
                ctx: makeCtx(),
                order: { id: 1 },
            } as unknown as OrderLineEvent);
            let release!: () => void;
            adjust.mockImplementationOnce(() => new Promise(r => (release = () => r({}))));
            let done = false;
            const waiting = service.waitForSettled(1, 1000).then(() => (done = true));
            await new Promise(r => setTimeout(r, 20));
            expect(done).toBe(false);
            const run = fire(1, 10);
            await vi.waitFor(() => expect(adjust).toHaveBeenCalled());
            expect(done).toBe(false);
            release();
            await run;
            await waiting;
            expect(done).toBe(true);
        });

        it('keeps the marker while another mutation event is still on its way', async () => {
            const event = (id: number): OrderLineEvent =>
                ({
                    type: 'updated',
                    ctx: makeCtx(),
                    order: { id },
                    orderLine: { id: 10 },
                }) as never;
            await blocking(event(1));
            await blocking(event(1));
            await fire(1, 10);
            let done = false;
            const waiting = service.waitForSettled(1, 1000).then(() => (done = true));
            await new Promise(r => setTimeout(r, 30));
            expect(done).toBe(false);
            await fire(1, 11);
            await waiting;
            expect(done).toBe(true);
        });

        it('gives up after the timeout when no rebalance ever starts', async () => {
            await blocking({
                type: 'updated',
                ctx: makeCtx(),
                order: { id: 1 },
            } as unknown as OrderLineEvent);
            const t = Date.now();
            await service.waitForSettled(1, 40);
            expect(Date.now() - t).toBeGreaterThanOrEqual(35);
        });

        it('does not make other orders wait', async () => {
            await blocking({
                type: 'updated',
                ctx: makeCtx(),
                order: { id: 1 },
            } as unknown as OrderLineEvent);
            const t = Date.now();
            await service.waitForSettled(2, 500);
            expect(Date.now() - t).toBeLessThan(100);
        });
    });
});
