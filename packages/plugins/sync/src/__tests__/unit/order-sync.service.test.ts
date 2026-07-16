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
        addPaymentToOrder: ReturnType<typeof vi.fn>;
    };
    let requestContextService: { create: ReturnType<typeof vi.fn> };
    let query: ReturnType<typeof vi.fn>;
    let update: ReturnType<typeof vi.fn>;
    let findOne: ReturnType<typeof vi.fn>;
    let dataSource: {
        query: ReturnType<typeof vi.fn>;
        getRepository: ReturnType<typeof vi.fn>;
        transaction: ReturnType<typeof vi.fn>;
    };
    let syncService: { writeToOutbox: ReturnType<typeof vi.fn> };
    let connection: { withTransaction: ReturnType<typeof vi.fn> };
    let options: { instanceType: string; instanceId: string };
    let service: OrderSyncService;

    beforeEach(() => {
        orderService = {
            create: vi.fn(async () => ({ id: 'local-order-1', code: 'ORD-LOCAL-1' })),
            addItemToOrder: vi.fn(async () => undefined),
            transitionToState: vi.fn(async () => ({ id: 'local-order-1' })),
            addPaymentToOrder: vi.fn(async () => ({ id: 'local-order-1', code: 'ORD-LOCAL-1' })),
        };
        requestContextService = { create: vi.fn(async () => ({})) };
        query = vi.fn();
        update = vi.fn();
        findOne = vi.fn();
        dataSource = {
            query,
            getRepository: vi.fn(() => ({ update, findOne })),
            transaction: vi.fn(async (work: (em: unknown) => unknown) => work({})),
        };
        syncService = { writeToOutbox: vi.fn(async () => undefined) };
        connection = {
            withTransaction: vi.fn(async (_ctx: unknown, work: (txCtx: unknown) => unknown) =>
                work({}),
            ),
        };
        options = { instanceType: 'central', instanceId: 'hub' };
        service = new OrderSyncService(
            orderService as never,
            requestContextService as never,
            dataSource as never,
            syncService as never,
            connection as never,
            options as never,
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

        it('transitions the new replica to payload.state when provided', async () => {
            query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ userId: 'user-1' }])
                .mockResolvedValueOnce([{ id: 'variant-1' }]);

            const event = {
                payload: { ...createdPayload, state: 'ArrangingPayment' },
            } as unknown as SyncEventByType<'order.created'>;

            await service.applyCreate(event);

            expect(orderService.transitionToState).toHaveBeenCalledWith(
                expect.anything(),
                'local-order-1',
                'ArrangingPayment',
            );
        });

        it('does not attempt a transition when payload.state is absent', async () => {
            query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ userId: 'user-1' }])
                .mockResolvedValueOnce([{ id: 'variant-1' }]);

            const event = {
                payload: createdPayload,
            } as unknown as SyncEventByType<'order.created'>;

            await service.applyCreate(event);

            expect(orderService.transitionToState).not.toHaveBeenCalled();
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

        it('throws when no local replica is found, so the caller retries with backoff', async () => {
            query.mockResolvedValueOnce([]);

            const event = {
                payload: { sourceOrderId: 'central-order-9', state: 'Shipped' },
            } as unknown as SyncEventByType<'order.updated'>;

            await expect(service.applyUpdate(event)).rejects.toThrow(/no local replica found/);

            expect(orderService.transitionToState).not.toHaveBeenCalled();
        });
    });

    describe('applyPaymentRecorded', () => {
        const basePayload = {
            sourceOrderId: 'central-order-9',
            method: 'online-stub',
            amount: 5000,
            state: 'Settled' as const,
            witnessedBy: 'hub',
        };

        it('applies as an informational projection when this instance only holds a replica', async () => {
            query.mockResolvedValueOnce([{ id: 'local-order-1' }]); // replica found

            const event = {
                payload: basePayload,
            } as unknown as SyncEventByType<'payment.recorded'>;
            await service.applyPaymentRecorded(event);

            expect(update).toHaveBeenCalledWith('local-order-1', {
                customFields: { paymentStatus: 'Settled' },
            });
            expect(orderService.addPaymentToOrder).not.toHaveBeenCalled();
        });

        it('applies as a real payment when this instance owns the order', async () => {
            query
                .mockResolvedValueOnce([]) // no replica found
                .mockResolvedValueOnce([{ id: 'central-order-9' }]); // own order found

            const event = {
                payload: basePayload,
            } as unknown as SyncEventByType<'payment.recorded'>;
            await service.applyPaymentRecorded(event);

            expect(orderService.addPaymentToOrder).toHaveBeenCalledWith(
                expect.anything(),
                'central-order-9',
                expect.objectContaining({ method: 'online-stub' }),
            );
            expect(update).not.toHaveBeenCalled();
        });

        it('throws when neither a replica nor the own order is found, so the caller retries', async () => {
            query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

            const event = {
                payload: basePayload,
            } as unknown as SyncEventByType<'payment.recorded'>;
            await expect(service.applyPaymentRecorded(event)).rejects.toThrow(
                /no matching local order/,
            );
        });
    });

    describe('recordWitnessedPayment', () => {
        it('applies immediately for real when the order is owned by this instance', async () => {
            findOne.mockResolvedValue({ id: 'order-1', customFields: {} });

            await service.recordWitnessedPayment({} as never, 'order-1', 'cash', 3000);

            expect(orderService.addPaymentToOrder).toHaveBeenCalledWith(
                expect.anything(),
                'order-1',
                expect.objectContaining({ method: 'cash' }),
            );
            expect(syncService.writeToOutbox).not.toHaveBeenCalled();
        });

        it('writes a payment.recorded fact instead of touching a replica directly', async () => {
            options.instanceType = 'branch';
            options.instanceId = 'branch-a';
            findOne.mockResolvedValue({
                id: 'order-1',
                customFields: { sourceOrderId: 'central-order-9', branchId: null },
            });

            await service.recordWitnessedPayment({} as never, 'order-1', 'cash', 3000);

            expect(orderService.addPaymentToOrder).not.toHaveBeenCalled();
            expect(syncService.writeToOutbox).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    eventType: 'payment.recorded',
                    payload: expect.objectContaining({
                        sourceOrderId: 'central-order-9',
                        method: 'cash',
                        amount: 3000,
                        state: 'Settled',
                        witnessedBy: 'branch-a',
                    }),
                }),
                'central',
            );
        });

        it('rejects when the order does not exist', async () => {
            findOne.mockResolvedValue(undefined);

            await expect(
                service.recordWitnessedPayment({} as never, 'missing', 'cash', 100),
            ).rejects.toThrow(/Order not found/);
        });
    });
});
