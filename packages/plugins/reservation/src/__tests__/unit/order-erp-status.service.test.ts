import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { OrderErpStatusService } from '../../order-erp-status.service';

describe('OrderErpStatusService.apply', () => {
    const ctx = {} as unknown as RequestContext;
    const orderRepo = { findOne: vi.fn(), update: vi.fn(async () => undefined) };
    const cancelResult = { apply: vi.fn(async () => 'cancelled') };
    let service: OrderErpStatusService;

    const order = (customFields: Record<string, unknown>): never =>
        ({ id: 'order-1', customFields }) as never;
    const statusWrites = (): unknown[] => orderRepo.update.mock.calls;

    beforeEach(() => {
        vi.clearAllMocks();
        orderRepo.findOne.mockResolvedValue({ id: 'order-1', customFields: {} });
        const connection = {
            getRepository: vi.fn(() => ({ ...orderRepo, query: vi.fn() })),
            withTransaction: vi.fn(async (c: unknown, work: (x: unknown) => unknown) => work(c)),
        };
        service = new OrderErpStatusService(
            connection as unknown as TransactionalConnection,
            cancelResult as never,
        );
    });

    it('writes nothing when no status could be derived (absent facts)', async () => {
        await service.apply(ctx, order({}), null);
        expect(statusWrites()).toHaveLength(0);
        expect(cancelResult.apply).not.toHaveBeenCalled();
    });

    it('writes only the erpStatus keys when the status moves forward', async () => {
        orderRepo.findOne.mockResolvedValue({
            id: 'order-1',
            customFields: { erpStatus: 'SENT_TO_ERP' },
        });
        await service.apply(ctx, order({}), 'PICKING');
        expect(orderRepo.update).toHaveBeenCalledWith('order-1', {
            customFields: { erpStatus: 'PICKING', erpStatusAt: expect.any(Date) },
        });
    });

    it.each(['PICKING', 'SHIPPING', 'CANCELLED'])(
        'does not move back from %s and a repeat is a no-op',
        async current => {
            orderRepo.findOne.mockResolvedValue({
                id: 'order-1',
                customFields: { erpStatus: current },
            });
            await service.apply(ctx, order({}), 'PICKING');
            expect(statusWrites()).toHaveLength(0);
        },
    );

    it('routes CANCELLED through the cancel-result path instead of writing the status', async () => {
        await service.apply(ctx, order({ uuid: 'u-1' }), 'CANCELLED');
        expect(cancelResult.apply).toHaveBeenCalledWith(ctx, {
            orderUuid: 'u-1',
            status: 'cancelled',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
        expect(statusWrites()).toHaveLength(0);
    });

    it('skips CANCELLED for an order without a uuid', async () => {
        await service.apply(ctx, order({}), 'CANCELLED');
        expect(cancelResult.apply).not.toHaveBeenCalled();
    });
});
