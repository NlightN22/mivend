import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PromoDiscountRuleService } from '../../promo-discount-rule.service';

const mockRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    createQueryBuilder: vi.fn(),
};

const mockQb = {
    where: vi.fn(),
    andWhere: vi.fn(),
    getMany: vi.fn(),
};
mockQb.where.mockReturnValue(mockQb);
mockQb.andWhere.mockReturnValue(mockQb);

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
};

const mockCtx = {} as unknown as RequestContext;
const now = new Date('2026-07-15T00:00:00.000Z');

function promoInput(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        erpId: 'promo-1',
        percent: 10,
        validFrom: new Date('2026-07-01T00:00:00.000Z'),
        validTo: new Date('2026-07-31T00:00:00.000Z'),
        triggerProductErpId: 'prod-trigger',
        triggerQuantity: 3,
        giftProductErpId: null,
        giftQuantity: null,
        operationKind: 'percent-discount',
        ...overrides,
    };
}

function promoRule(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        triggerProductErpId: 'prod-trigger',
        triggerQuantity: 3,
        giftProductErpId: null,
        percent: 10,
        validFrom: new Date('2026-07-01T00:00:00.000Z'),
        validTo: new Date('2026-07-31T00:00:00.000Z'),
        ...overrides,
    };
}

describe('PromoDiscountRuleService (issue #107)', () => {
    let service: PromoDiscountRuleService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo.createQueryBuilder.mockReturnValue(mockQb);
        service = new PromoDiscountRuleService(
            mockConnection as unknown as TransactionalConnection,
        );
    });

    describe('upsertPromoRule', () => {
        it('creates a new promo rule row with facet/priceType columns forced null', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            const input = promoInput();
            mockRepo.create.mockReturnValue(input);
            mockRepo.save.mockResolvedValue(input);

            await service.upsertPromoRule(mockCtx, input as never);

            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    erpId: 'promo-1',
                    priceTypeCode: null,
                    facetCode: null,
                    facetValueCode: null,
                    minWeightKg: null,
                    minAmount: null,
                    triggerProductErpId: 'prod-trigger',
                }),
            );
        });

        it('updates an existing promo rule row matched by erpId', async () => {
            const existing = promoInput({ percent: 5 });
            mockRepo.findOne.mockResolvedValue(existing);
            mockRepo.save.mockResolvedValue(existing);

            await service.upsertPromoRule(mockCtx, promoInput({ percent: 20 }) as never);

            expect(existing.percent).toBe(20);
            expect(mockRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('getBestPromoPercent', () => {
        it('returns null with no order-line quantities (catalog display, never triggers a promo)', async () => {
            const result = await service.getBestPromoPercent(
                mockCtx,
                'prod-trigger',
                now,
                new Map(),
            );
            expect(result).toBeNull();
            expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it('percent-type: discounts the trigger product itself once its own quantity threshold is reached', async () => {
            mockQb.getMany.mockResolvedValue([promoRule({ percent: 12 })]);
            const result = await service.getBestPromoPercent(
                mockCtx,
                'prod-trigger',
                now,
                new Map([['prod-trigger', 3]]),
            );
            expect(result).toBe(12);
        });

        it('percent-type: does not qualify below the trigger quantity threshold', async () => {
            mockQb.getMany.mockResolvedValue([promoRule({ percent: 12 })]);
            const result = await service.getBestPromoPercent(
                mockCtx,
                'prod-trigger',
                now,
                new Map([['prod-trigger', 2]]),
            );
            expect(result).toBeNull();
        });

        it('gift-type: discounts the gift product line once the trigger product threshold is reached elsewhere in the order', async () => {
            mockQb.getMany.mockResolvedValue([
                promoRule({ giftProductErpId: 'prod-gift', percent: 99 }),
            ]);
            const result = await service.getBestPromoPercent(
                mockCtx,
                'prod-gift',
                now,
                new Map([['prod-trigger', 3]]),
            );
            expect(result).toBe(99);
        });

        it('gift-type: never discounts the trigger product line itself (only the gift line)', async () => {
            mockQb.getMany.mockResolvedValue([
                promoRule({ giftProductErpId: 'prod-gift', percent: 99 }),
            ]);
            const result = await service.getBestPromoPercent(
                mockCtx,
                'prod-trigger',
                now,
                new Map([['prod-trigger', 3]]),
            );
            expect(result).toBeNull();
        });

        it('picks the highest percent when multiple promo rules qualify for the same product', async () => {
            mockQb.getMany.mockResolvedValue([
                promoRule({ percent: 10 }),
                promoRule({ percent: 25 }),
            ]);
            const result = await service.getBestPromoPercent(
                mockCtx,
                'prod-trigger',
                now,
                new Map([['prod-trigger', 5]]),
            );
            expect(result).toBe(25);
        });
    });
});
