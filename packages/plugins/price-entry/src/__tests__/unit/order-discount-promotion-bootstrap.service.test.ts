import { describe, expect, it, vi } from 'vitest';
import type {
    ProcessContext,
    PromotionService,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';

import { ORDER_DISCOUNT_ACTION_CODE } from '../../order-discount.promotion';
import { OrderDiscountPromotionBootstrapService } from '../../order-discount-promotion-bootstrap.service';

function setup(existing: unknown[], isWorker = false) {
    const ctx = {} as RequestContext;
    const connection = {
        withTransaction: vi.fn(async (c: RequestContext, work: (tx: RequestContext) => unknown) =>
            work(c),
        ),
        getRepository: vi.fn(() => ({
            query: vi.fn(async () => undefined),
            find: vi.fn(async () => existing),
        })),
    };
    const promotionService = {
        createPromotion: vi.fn(async () => ({})),
        updatePromotion: vi.fn(async () => ({})),
    };
    const service = new OrderDiscountPromotionBootstrapService(
        connection as unknown as TransactionalConnection,
        promotionService as unknown as PromotionService,
        { create: vi.fn(async () => ctx) } as unknown as RequestContextService,
        { isWorker } as ProcessContext,
    );
    return { service, promotionService };
}

const promotion = (enabled: boolean, deletedAt: Date | null = null) => ({
    id: 5,
    enabled,
    deletedAt,
    actions: [{ code: ORDER_DISCOUNT_ACTION_CODE }],
});

describe('OrderDiscountPromotionBootstrapService', () => {
    it('creates the promotion when none exists', async () => {
        const { service, promotionService } = setup([]);
        await service.onApplicationBootstrap();
        expect(promotionService.createPromotion).toHaveBeenCalledTimes(1);
    });

    it('leaves an enabled promotion alone', async () => {
        const { service, promotionService } = setup([promotion(true)]);
        await service.onApplicationBootstrap();
        expect(promotionService.createPromotion).not.toHaveBeenCalled();
        expect(promotionService.updatePromotion).not.toHaveBeenCalled();
    });

    it('re-enables a disabled promotion instead of creating a second one', async () => {
        const { service, promotionService } = setup([promotion(false)]);
        await service.onApplicationBootstrap();
        expect(promotionService.updatePromotion).toHaveBeenCalledWith(expect.anything(), {
            id: 5,
            enabled: true,
        });
        expect(promotionService.createPromotion).not.toHaveBeenCalled();
    });

    it('creates a new one when the old one was soft-deleted', async () => {
        const { service, promotionService } = setup([promotion(true, new Date())]);
        await service.onApplicationBootstrap();
        expect(promotionService.createPromotion).toHaveBeenCalledTimes(1);
    });

    it('does nothing in a worker process', async () => {
        const { service, promotionService } = setup([], true);
        await service.onApplicationBootstrap();
        expect(promotionService.createPromotion).not.toHaveBeenCalled();
    });
});
