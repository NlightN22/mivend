import { describe, expect, it, vi } from 'vitest';
import type { OrderLine } from '@vendure/core';
import type { InsertEvent } from 'typeorm';

import { OrderLineIdentity } from '../../entities/order-line-identity.entity';
import { OrderLineIdentitySubscriber } from '../../order-line-identity.subscriber';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('OrderLineIdentitySubscriber', () => {
    it('inserts one identity row through the same manager as the line insert', async () => {
        const manager = { insert: vi.fn().mockResolvedValue(undefined) };
        const event = { entity: { id: 15 }, manager } as unknown as InsertEvent<OrderLine>;

        await new OrderLineIdentitySubscriber().afterInsert(event);

        expect(manager.insert).toHaveBeenCalledTimes(1);
        expect(manager.insert).toHaveBeenCalledWith(OrderLineIdentity, {
            orderLineId: 15,
            uuid: expect.stringMatching(UUID_V4),
        });
    });

    it('gives each new line its own uuid', async () => {
        const manager = { insert: vi.fn().mockResolvedValue(undefined) };
        const subscriber = new OrderLineIdentitySubscriber();
        for (const id of [1, 2]) {
            await subscriber.afterInsert({
                entity: { id },
                manager,
            } as unknown as InsertEvent<OrderLine>);
        }

        const [first, second] = manager.insert.mock.calls.map(call => call[1].uuid);
        expect(first).not.toBe(second);
    });

    it('does not react to updates, so a merged add (a quantity update) adds no identity', () => {
        const subscriber = new OrderLineIdentitySubscriber() as unknown as Record<string, unknown>;

        expect(subscriber.afterUpdate).toBeUndefined();
        expect(subscriber.beforeUpdate).toBeUndefined();
    });
});
