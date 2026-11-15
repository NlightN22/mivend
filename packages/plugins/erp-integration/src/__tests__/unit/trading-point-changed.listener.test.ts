import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { TradingPointVersionedEvent } from '@mivend/plugin-counterparty';

import { TradingPointChangedListener } from '../../trading-point-changed.listener';

function setup(instanceType: 'central' | 'branch') {
    let handler: ((event: TradingPointVersionedEvent) => void) | undefined;
    const events = { next: (event: TradingPointVersionedEvent): void => handler?.(event) };
    const eventBus = {
        ofType: () => ({
            subscribe: (fn: (event: TradingPointVersionedEvent) => void) => (handler = fn),
        }),
    };
    const enqueue = vi.fn(async () => 'queued');
    const build = vi.fn();
    const listener = new TradingPointChangedListener(
        eventBus as never,
        { enqueue } as never,
        { build } as never,
        { instanceType } as never,
    );
    listener.onApplicationBootstrap();
    return { events, enqueue, build };
}

describe('TradingPointChangedListener', () => {
    const ctx = {} as RequestContext;

    it('enqueues one outbound event per version event under the point lock', async () => {
        const { events, enqueue, build } = setup('central');
        events.next(new TradingPointVersionedEvent(ctx, 'u-1', 4));
        await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));

        const input = (enqueue.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
        expect(input).toMatchObject({
            eventType: 'trading-point.changed',
            subject: { uuid: 'u-1', version: 4 },
            lockKey: 'trading-point:u-1',
        });
        await (input.build as (c: unknown) => Promise<unknown>)(ctx);
        expect(build).toHaveBeenCalledWith(ctx, 'u-1');
    });

    it('does not subscribe on a branch instance', () => {
        const { events, enqueue } = setup('branch');
        events.next(new TradingPointVersionedEvent(ctx, 'u-1', 4));
        expect(enqueue).not.toHaveBeenCalled();
    });
});
