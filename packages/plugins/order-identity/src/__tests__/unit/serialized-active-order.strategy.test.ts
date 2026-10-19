import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { ActiveOrderStrategy, Injector, RequestContext } from '@vendure/core';

import {
    SerializedActiveOrderStrategy,
    serializeActiveOrderStrategies,
} from '../../serialized-active-order.strategy';

const inner = (name: string): ActiveOrderStrategy<Record<string, unknown>> => ({
    name,
    determineActiveOrder: vi.fn().mockResolvedValue(undefined),
    createActiveOrder: vi.fn(),
});

describe('SerializedActiveOrderStrategy', () => {
    it('wraps every configured strategy and keeps its name and createActiveOrder', () => {
        const wrapped = serializeActiveOrderStrategies([inner('a'), inner('b')]);

        expect(Array.isArray(wrapped) && wrapped.map(s => s.name)).toEqual(['a', 'b']);
        expect(new SerializedActiveOrderStrategy(inner('c')).createActiveOrder).toBeTypeOf(
            'function',
        );
    });

    // Pins the TypeORM shape the transaction check reads; a change must fail here, not disable the lock.
    it('delegates without locking when the manager has no active query runner', async () => {
        const manager = new DataSource({ type: 'postgres' }).manager;
        const innerStrategy = inner('d');
        const strategy = new SerializedActiveOrderStrategy(innerStrategy);
        await strategy.init({
            get: () => ({ getRepository: () => ({ manager }) }),
        } as unknown as Injector);

        await expect(
            strategy.determineActiveOrder({} as RequestContext, {}),
        ).resolves.toBeUndefined();
        expect(innerStrategy.determineActiveOrder).toHaveBeenCalledTimes(1);
    });
});
