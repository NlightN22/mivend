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
    beforeEach(() => recompute.mockReset().mockResolvedValue(0));

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

    it('does not subscribe on a branch', () => {
        const { listener, eventBus } = make('branch');
        listener.onApplicationBootstrap();
        expect(eventBus.ofType).not.toHaveBeenCalled();
    });
});
