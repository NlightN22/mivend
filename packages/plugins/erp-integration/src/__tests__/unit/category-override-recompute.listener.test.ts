import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionEvent } from '@vendure/core';

import { CategoryOverrideRecomputeListener } from '../../category-override-recompute.listener';
import type { ErpIntegrationPluginOptions } from '../../types';

const recompute = vi.hoisted(() => vi.fn());
vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<typeof import('shared')>()),
    recomputeCategoryTree: recompute,
}));

const make = (instanceType: 'central' | 'branch' = 'central') => {
    const subscribe = vi.fn();
    const eventBus = { ofType: vi.fn(() => ({ subscribe })) };
    const listener = new CategoryOverrideRecomputeListener(
        eventBus as never,
        { create: vi.fn().mockResolvedValue({}) } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { instanceType } as ErpIntegrationPluginOptions,
    );
    return { listener, eventBus };
};
const event = (type: string, input: unknown): CollectionEvent =>
    ({ type, input }) as unknown as CollectionEvent;

describe('CategoryOverrideRecomputeListener', () => {
    beforeEach(() => {
        recompute.mockReset().mockResolvedValue(0);
    });

    it.each([['hidden'], ['visible'], [null]])(
        'recomputes the tree when the override is set to %s',
        async value => {
            await make().listener.handle(
                event('updated', { customFields: { visibilityOverride: value } }),
            );
            expect(recompute).toHaveBeenCalledTimes(1);
        },
    );

    it('ignores updates that do not touch the override (including its own recompute writes)', async () => {
        const { listener } = make();
        await listener.handle(event('updated', { isPrivate: true }));
        await listener.handle(event('updated', { customFields: {} }));
        await listener.handle(event('created', { customFields: { visibilityOverride: 'hidden' } }));
        expect(recompute).not.toHaveBeenCalled();
    });

    it('coalesces overlapping events into one in-flight run plus one rerun', async () => {
        let release: () => void = () => undefined;
        recompute
            .mockReset()
            .mockImplementationOnce(
                () => new Promise<number>(resolve => (release = () => resolve(0))),
            );
        recompute.mockResolvedValue(0);
        const { listener } = make();
        const ev = event('updated', { customFields: { visibilityOverride: 'hidden' } });
        const first = listener.handle(ev);
        await vi.waitFor(() => expect(recompute).toHaveBeenCalledTimes(1));
        const others = [listener.handle(ev), listener.handle(ev)];
        release();
        await Promise.all([first, ...others]);
        expect(recompute).toHaveBeenCalledTimes(2);
    });

    it('retries after a tree lock_timeout (55P03) instead of waiting for the scheduler', async () => {
        const timeout = Object.assign(new Error('lock timeout'), {
            driverError: { code: '55P03' },
        });
        recompute.mockReset().mockRejectedValueOnce(timeout).mockResolvedValue(0);
        await make().listener.handle(
            event('updated', { customFields: { visibilityOverride: 'hidden' } }),
        );
        expect(recompute).toHaveBeenCalledTimes(2);
    });

    it('retries across consecutive lock timeouts and merges a parallel event into the retry', async () => {
        const timeout = (): Error => Object.assign(new Error('lock timeout'), { code: '55P03' });
        let release: () => void = () => undefined;
        recompute
            .mockReset()
            .mockImplementationOnce(
                () => new Promise<number>((_, reject) => (release = () => reject(timeout()))),
            )
            .mockRejectedValueOnce(timeout())
            .mockResolvedValue(0);
        const { listener } = make();
        const ev = event('updated', { customFields: { visibilityOverride: 'hidden' } });
        const first = listener.handle(ev);
        await vi.waitFor(() => expect(recompute).toHaveBeenCalledTimes(1));
        const parallel = listener.handle(ev);
        release();
        await Promise.all([first, parallel]);
        expect(recompute).toHaveBeenCalledTimes(3);
    });

    it('gives up after 30 minutes of lock timeouts so the scheduled task takes over', async () => {
        vi.useFakeTimers();
        try {
            const timeout = Object.assign(new Error('lock timeout'), { code: '55P03' });
            recompute.mockReset().mockImplementation(async () => {
                vi.advanceTimersByTime(10 * 60 * 1000);
                throw timeout;
            });
            await expect(
                make().listener.handle(
                    event('updated', { customFields: { visibilityOverride: 'hidden' } }),
                ),
            ).rejects.toBe(timeout);
            expect(recompute).toHaveBeenCalledTimes(3);
        } finally {
            vi.useRealTimers();
        }
    });

    it('drops a pending rerun when a different error ends the run', async () => {
        const { listener } = make();
        recompute.mockReset().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(0);
        const ev = event('updated', { customFields: { visibilityOverride: 'hidden' } });
        const first = listener.handle(ev);
        const parallel = listener.handle(ev);
        parallel.catch(() => undefined);
        await expect(first).rejects.toThrow('boom');
        expect(recompute).toHaveBeenCalledTimes(1);
    });

    it('does not swallow other errors', async () => {
        recompute.mockRejectedValue(new Error('boom'));
        const { listener } = make();
        await expect(
            listener.handle(event('updated', { customFields: { visibilityOverride: 'hidden' } })),
        ).rejects.toThrow('boom');
        expect(recompute).toHaveBeenCalledTimes(1);
    });

    it('does not subscribe on a branch', () => {
        const { listener, eventBus } = make('branch');
        listener.onApplicationBootstrap();
        expect(eventBus.ofType).not.toHaveBeenCalled();
    });
});
