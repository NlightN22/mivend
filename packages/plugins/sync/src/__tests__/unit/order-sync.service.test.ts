import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncEventByType } from 'shared';

import { OrderSyncService } from '../../order-sync.service';

const createdPayload = {
    sourceOrderId: 'central-order-9',
    orderCode: 'ORD-9',
    customerEmail: 'ivan@example.com',
    branchId: 'branch-a',
    lines: [{ sku: 'SKU-1', quantity: 2, unitPrice: 1000 }],
};

describe('OrderSyncService', () => {
    let orderService: {
        create: ReturnType<typeof vi.fn>;
        addItemToOrder: ReturnType<typeof vi.fn>;
        transitionToState: ReturnType<typeof vi.fn>;
    };
    let requestContextService: { create: ReturnType<typeof vi.fn> };
    let query: ReturnType<typeof vi.fn>;
    let update: ReturnType<typeof vi.fn>;
    let dataSource: { query: ReturnType<typeof vi.fn>; getRepository: ReturnType<typeof vi.fn> };
    let service: OrderSyncService;

    beforeEach(() => {
        orderService = {
            create: vi.fn(async () => ({ id: 'local-order-1', code: 'ORD-LOCAL-1' })),
            addItemToOrder: vi.fn(async () => undefined),
            transitionToState: vi.fn(async () => ({ id: 'local-order-1' })),
        };
        requestContextService = { create: vi.fn(async () => ({})) };
        query = vi.fn();
        update = vi.fn();
        dataSource = {
            query,
            getRepository: vi.fn(() => ({ update })),
        };
        service = new OrderSyncService(
            orderService as never,
            requestContextService as never,
            dataSource as never,
        );
    });

    describe('applyCreate', () => {
        it('creates a local order, adds each resolved line, and stamps sourceOrderId', async () => {
            query
                .mockResolvedValueOnce([]) // no existing replica
                .mockResolvedValueOnce([{ userId: 'user-1' }]) // customer lookup
                .mockResolvedValueOnce([{ id: 'variant-1' }]); // variant lookup

            const event = {
                payload: createdPayload,
            } as unknown as SyncEventByType<'order.created'>;

            await service.applyCreate(event);

            expect(orderService.create).toHaveBeenCalledWith(expect.anything(), 'user-1');
            expect(orderService.addItemToOrder).toHaveBeenCalledWith(
                expect.anything(),
                'local-order-1',
                'variant-1',
                2,
            );
            expect(update).toHaveBeenCalledWith('local-order-1', {
                customFields: { sourceOrderId: 'central-order-9', branchId: 'branch-a' },
            });
        });

        it('is idempotent — does nothing if a replica with this sourceOrderId already exists', async () => {
            query.mockResolvedValueOnce([{ id: 'already-there' }]);

            const event = {
                payload: createdPayload,
            } as unknown as SyncEventByType<'order.created'>;

            await service.applyCreate(event);

            expect(orderService.create).not.toHaveBeenCalled();
        });

        it('skips without throwing when no local customer matches the email', async () => {
            query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

            const event = {
                payload: createdPayload,
            } as unknown as SyncEventByType<'order.created'>;

            await service.applyCreate(event);

            expect(orderService.create).not.toHaveBeenCalled();
        });

        it('skips a line without throwing when no local variant matches the sku, but still creates the order', async () => {
            query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ userId: 'user-1' }])
                .mockResolvedValueOnce([]); // no variant found

            const event = {
                payload: createdPayload,
            } as unknown as SyncEventByType<'order.created'>;

            await service.applyCreate(event);

            expect(orderService.create).toHaveBeenCalled();
            expect(orderService.addItemToOrder).not.toHaveBeenCalled();
        });
    });

    describe('applyUpdate', () => {
        it('transitions the local replica (found by sourceOrderId) to the synced state', async () => {
            query.mockResolvedValueOnce([{ id: 'local-order-1' }]);

            const event = {
                payload: { sourceOrderId: 'central-order-9', state: 'Shipped' },
            } as unknown as SyncEventByType<'order.updated'>;

            await service.applyUpdate(event);

            expect(orderService.transitionToState).toHaveBeenCalledWith(
                expect.anything(),
                'local-order-1',
                'Shipped',
            );
        });

        it('skips without throwing when no local replica is found', async () => {
            query.mockResolvedValueOnce([]);

            const event = {
                payload: { sourceOrderId: 'central-order-9', state: 'Shipped' },
            } as unknown as SyncEventByType<'order.updated'>;

            await service.applyUpdate(event);

            expect(orderService.transitionToState).not.toHaveBeenCalled();
        });
    });
});
