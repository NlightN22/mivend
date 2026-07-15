import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventBus } from '@vendure/core';
import { OrderReadyForErpEvent } from '@mivend/plugin-erp-order';

import { OrderConsumer } from '../../consumers/order.consumer';
import type { SyncPluginOptions } from '../../types';

const CENTRAL_OPTIONS: SyncPluginOptions = {
    instanceType: 'central',
    instanceId: 'hub',
    redis: { host: 'localhost', port: 6379 },
    rabbitmq: { url: 'amqp://localhost' },
};

const BRANCH_OPTIONS: SyncPluginOptions = {
    ...CENTRAL_OPTIONS,
    instanceType: 'branch',
    instanceId: 'branch-a',
};

function makeOrder(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        id: 'order-1',
        code: 'ORD-1',
        customer: { emailAddress: 'ivan@example.com' },
        customFields: { branchId: 'branch-a' },
        lines: [
            {
                quantity: 2,
                proratedUnitPriceWithTax: 1000,
                productVariant: { sku: 'SKU-1' },
            },
        ],
        ...overrides,
    };
}

describe('OrderConsumer', () => {
    let subscribers: Map<unknown, (event: unknown) => void>;
    let eventBus: { ofType: ReturnType<typeof vi.fn> };
    let syncService: { writeToOutbox: ReturnType<typeof vi.fn> };
    let dataSource: {
        transaction: ReturnType<typeof vi.fn>;
        getRepository: ReturnType<typeof vi.fn>;
    };
    let findOne: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        subscribers = new Map();
        eventBus = {
            ofType: vi.fn((eventClass: unknown) => ({
                subscribe: (fn: (event: unknown) => void) => subscribers.set(eventClass, fn),
            })),
        };
        syncService = { writeToOutbox: vi.fn(async () => undefined) };
        findOne = vi.fn();
        dataSource = {
            transaction: vi.fn(async (work: (em: unknown) => unknown) => work({})),
            getRepository: vi.fn(() => ({ findOne })),
        };
    });

    function makeConsumer(options: SyncPluginOptions): OrderConsumer {
        const consumer = new OrderConsumer(
            eventBus as unknown as EventBus,
            dataSource as never,
            syncService as never,
            options,
        );
        consumer.onApplicationBootstrap();
        return consumer;
    }

    it("targets the order's own servicing branch when placed on Central", async () => {
        findOne.mockResolvedValue(makeOrder());
        makeConsumer(CENTRAL_OPTIONS);
        const handler = subscribers.get(OrderReadyForErpEvent)!;

        await handler(new OrderReadyForErpEvent({} as never, 'order-1', 'ORD-1'));

        expect(syncService.writeToOutbox).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                eventType: 'order.created',
                payload: expect.objectContaining({
                    sourceOrderId: 'order-1',
                    orderCode: 'ORD-1',
                    customerEmail: 'ivan@example.com',
                    branchId: 'branch-a',
                    lines: [{ sku: 'SKU-1', quantity: 2, unitPrice: 1000 }],
                }),
            }),
            'branch-a',
        );
    });

    it('targets "central" when placed on a Branch, regardless of the order\'s own branchId', async () => {
        findOne.mockResolvedValue(makeOrder());
        makeConsumer(BRANCH_OPTIONS);
        const handler = subscribers.get(OrderReadyForErpEvent)!;

        await handler(new OrderReadyForErpEvent({} as never, 'order-1', 'ORD-1'));

        expect(syncService.writeToOutbox).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ eventType: 'order.created' }),
            'central',
        );
    });

    it('falls back to "all-branches" on Central when the order has no resolved trading point', async () => {
        findOne.mockResolvedValue(makeOrder({ customFields: { branchId: null } }));
        makeConsumer(CENTRAL_OPTIONS);
        const handler = subscribers.get(OrderReadyForErpEvent)!;

        await handler(new OrderReadyForErpEvent({} as never, 'order-1', 'ORD-1'));

        expect(syncService.writeToOutbox).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            'all-branches',
        );
    });

    it('skips an order with no customer', async () => {
        findOne.mockResolvedValue(makeOrder({ customer: undefined }));
        makeConsumer(CENTRAL_OPTIONS);
        const handler = subscribers.get(OrderReadyForErpEvent)!;

        await handler(new OrderReadyForErpEvent({} as never, 'order-1', 'ORD-1'));

        expect(syncService.writeToOutbox).not.toHaveBeenCalled();
    });

    it('skips a missing order without throwing', async () => {
        findOne.mockResolvedValue(undefined);
        makeConsumer(CENTRAL_OPTIONS);
        const handler = subscribers.get(OrderReadyForErpEvent)!;

        await expect(
            handler(new OrderReadyForErpEvent({} as never, 'order-1', 'ORD-1')),
        ).resolves.toBeUndefined();
        expect(syncService.writeToOutbox).not.toHaveBeenCalled();
    });

    it('never re-publishes an order that is itself a sync replica (has sourceOrderId set)', async () => {
        findOne.mockResolvedValue(
            makeOrder({ customFields: { branchId: 'branch-a', sourceOrderId: 'central-order-9' } }),
        );
        makeConsumer(BRANCH_OPTIONS);
        const handler = subscribers.get(OrderReadyForErpEvent)!;

        await handler(new OrderReadyForErpEvent({} as never, 'order-1', 'ORD-1'));

        expect(syncService.writeToOutbox).not.toHaveBeenCalled();
    });
});
