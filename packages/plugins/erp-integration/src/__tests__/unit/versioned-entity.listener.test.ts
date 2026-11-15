import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import {
    CounterpartyVersionedEvent,
    TradingPointVersionedEvent,
} from '@mivend/plugin-counterparty';

import { VersionedEntityListener } from '../../versioned-entity.listener';

type AnyEvent = TradingPointVersionedEvent | CounterpartyVersionedEvent;

function setup(instanceType: 'central' | 'branch'): {
    emit: (event: AnyEvent) => void;
    enqueue: ReturnType<typeof vi.fn>;
    build: ReturnType<typeof vi.fn>;
} {
    const handlers = new Map<unknown, (event: AnyEvent) => void>();
    const eventBus = {
        ofType: (EventClass: unknown) => ({
            subscribe: (fn: (event: AnyEvent) => void) => handlers.set(EventClass, fn),
        }),
    };
    const enqueue = vi.fn(async () => 'queued');
    const build = vi.fn();
    const listener = new VersionedEntityListener(
        eventBus as never,
        { enqueue } as never,
        { get: () => ({ build }) } as never,
        { instanceType } as never,
    );
    listener.onApplicationBootstrap();
    const emit = (event: AnyEvent): void => handlers.get(event.constructor)?.(event);
    return { emit, enqueue, build };
}

describe('VersionedEntityListener', () => {
    const ctx = {} as RequestContext;

    it('enqueues one outbound event per trading point version event under the point lock', async () => {
        const { emit, enqueue, build } = setup('central');
        emit(new TradingPointVersionedEvent(ctx, 'u-1', 4));
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

    it('enqueues one outbound event per counterparty version event, keyed by the erp id', async () => {
        const { emit, enqueue, build } = setup('central');
        emit(new CounterpartyVersionedEvent(ctx, 'cp-erp-1', 2));
        await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));

        const input = (enqueue.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
        expect(input).toMatchObject({
            eventType: 'counterparty.changed',
            subject: { erpId: 'cp-erp-1', version: 2 },
            lockKey: 'counterparty-outbound:cp-erp-1',
        });
        await (input.build as (c: unknown) => Promise<unknown>)(ctx);
        expect(build).toHaveBeenCalledWith(ctx, 'cp-erp-1');
    });

    it('does not subscribe on a branch instance', () => {
        const { emit, enqueue } = setup('branch');
        emit(new TradingPointVersionedEvent(ctx, 'u-1', 4));
        emit(new CounterpartyVersionedEvent(ctx, 'cp-erp-1', 4));
        expect(enqueue).not.toHaveBeenCalled();
    });
});
