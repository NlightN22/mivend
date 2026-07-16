import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { DiscountRuleService } from '../../discount-rule.service';
import type { DiscountRegistryService } from '../../discount-registry.service';

const mockRepo = {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    createQueryBuilder: vi.fn(),
};

const mockQb = {
    insert: vi.fn(),
    into: vi.fn(),
    values: vi.fn(),
    orUpdate: vi.fn(),
    execute: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    getMany: vi.fn(),
};
mockQb.insert.mockReturnValue(mockQb);
mockQb.into.mockReturnValue(mockQb);
mockQb.values.mockReturnValue(mockQb);
mockQb.orUpdate.mockReturnValue(mockQb);
mockQb.where.mockReturnValue(mockQb);
mockQb.andWhere.mockReturnValue(mockQb);

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
};

const mockCtx = {} as unknown as RequestContext;

const now = new Date('2026-07-15T00:00:00.000Z');

function rule(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        priceTypeCode: 'WHOLESALE',
        facetCode: 'brand',
        facetValueCode: 'lukoil',
        percent: 10,
        validFrom: new Date('2026-07-01T00:00:00.000Z'),
        validTo: new Date('2026-07-31T00:00:00.000Z'),
        minWeightKg: null,
        minAmount: null,
        ...overrides,
    };
}

describe('DiscountRuleService', () => {
    let service: DiscountRuleService;
    let discountRegistryService: { upsertFromRule: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo.createQueryBuilder.mockReturnValue(mockQb);
        // No grant metadata for the candidate rules unless a test overrides this — matches
        // prior behavior where DiscountGrant/counterparty scoping didn't exist yet.
        mockRepo.find.mockResolvedValue([]);
        discountRegistryService = { upsertFromRule: vi.fn(async () => undefined) };
        service = new DiscountRuleService(
            mockConnection as unknown as TransactionalConnection,
            discountRegistryService as unknown as DiscountRegistryService,
        );
    });

    describe('upsert', () => {
        it('creates new record when none exists for erpId', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            const input = rule({ erpId: 'erp-1' });
            mockRepo.create.mockReturnValue(input);
            mockRepo.save.mockResolvedValue(input);

            await service.upsert(mockCtx, input as never);

            expect(mockRepo.create).toHaveBeenCalledWith(input);
            expect(mockRepo.save).toHaveBeenCalledWith(input);
        });

        it('updates existing record matched by erpId', async () => {
            const existing = rule({ erpId: 'erp-1', percent: 5 });
            mockRepo.findOne.mockResolvedValue(existing);
            mockRepo.save.mockResolvedValue(existing);

            await service.upsert(mockCtx, rule({ erpId: 'erp-1', percent: 15 }) as never);

            expect(existing.percent).toBe(15);
            expect(mockRepo.create).not.toHaveBeenCalled();
        });

        it('syncs the registry for an ERP-origin rule', async () => {
            const input = rule({ erpId: 'erp-1' });
            mockRepo.findOne.mockResolvedValue(null);
            mockRepo.create.mockReturnValue(input);
            mockRepo.save.mockResolvedValue(input);

            await service.upsert(mockCtx, input as never);

            expect(discountRegistryService.upsertFromRule).toHaveBeenCalledWith(mockCtx, input);
        });

        it('does not sync the registry for a portal-origin rule (already synced by DiscountGrantService)', async () => {
            const input = rule({ erpId: 'portal-42' });
            mockRepo.findOne.mockResolvedValue(null);
            mockRepo.create.mockReturnValue(input);
            mockRepo.save.mockResolvedValue(input);

            await service.upsert(mockCtx, input as never);

            expect(discountRegistryService.upsertFromRule).not.toHaveBeenCalled();
        });
    });

    describe('bulkUpsert', () => {
        it('returns 0 and skips DB for empty array', async () => {
            const result = await service.bulkUpsert(mockCtx, []);
            expect(result).toBe(0);
            expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it('syncs the registry for every ERP-origin rule in the batch, skipping portal-origin ones', async () => {
            const savedRules = [rule({ erpId: 'erp-1' }), rule({ erpId: 'erp-2' })];
            mockRepo.find.mockResolvedValue(savedRules);

            await service.bulkUpsert(mockCtx, [
                rule({ erpId: 'erp-1' }) as never,
                rule({ erpId: 'erp-2' }) as never,
                rule({ erpId: 'portal-1' }) as never,
            ]);

            expect(mockRepo.find).toHaveBeenCalledWith({
                where: { erpId: expect.anything() },
            });
            expect(discountRegistryService.upsertFromRule).toHaveBeenCalledTimes(2);
        });
    });

    describe('getBestPercent', () => {
        it('returns null when no rules match', async () => {
            mockQb.getMany.mockResolvedValue([]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'castrol' }],
                now,
            );

            expect(result).toBeNull();
        });

        it('returns the percent of a single matching facet rule', async () => {
            mockQb.getMany.mockResolvedValue([rule({ percent: 10 })]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
            );

            expect(result).toBe(10);
        });

        it('falls back to a global rule (null facet) when no facet rule matches', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({ facetCode: null, facetValueCode: null, percent: 5 }),
            ]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'castrol' }],
                now,
            );

            expect(result).toBe(5);
        });

        it('picks the highest percent when multiple rules match', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({ facetCode: 'brand', facetValueCode: 'lukoil', percent: 10 }),
                rule({ facetCode: 'category', facetValueCode: 'oil', percent: 20 }),
            ]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [
                    { facetCode: 'brand', valueCode: 'lukoil' },
                    { facetCode: 'category', valueCode: 'oil' },
                ],
                now,
            );

            expect(result).toBe(20);
        });

        it('ignores a rule that does not match the variant facet values', async () => {
            mockQb.getMany.mockResolvedValue([rule({ facetValueCode: 'castrol' })]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
            );

            expect(result).toBeNull();
        });

        it('filters by priceTypeCode and validity window at the query level', async () => {
            mockQb.getMany.mockResolvedValue([]);

            await service.getBestPercent(mockCtx, 'WHOLESALE', [], now);

            expect(mockQb.where).toHaveBeenCalledWith('dr.priceTypeCode = :priceTypeCode', {
                priceTypeCode: 'WHOLESALE',
            });
            expect(mockQb.andWhere).toHaveBeenCalledWith(
                'dr.validFrom <= :now AND dr.validTo >= :now',
                { now },
            );
        });

        it('excludes a weight-tiered rule when the threshold is not reached', async () => {
            mockQb.getMany.mockResolvedValue([rule({ percent: 15, minWeightKg: 500 })]);
            const weightByFacet = new Map([['brand:lukoil', 300]]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
                weightByFacet,
            );

            expect(result).toBeNull();
        });

        it('includes a weight-tiered rule once the threshold is reached', async () => {
            mockQb.getMany.mockResolvedValue([rule({ percent: 15, minWeightKg: 500 })]);
            const weightByFacet = new Map([['brand:lukoil', 500]]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
                weightByFacet,
            );

            expect(result).toBe(15);
        });

        it('picks the highest reached rung of a ladder', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({ percent: 15, minWeightKg: 500 }),
                rule({ percent: 18, minWeightKg: 800 }),
                rule({ percent: 20, minWeightKg: 1000 }),
            ]);
            const weightByFacet = new Map([['brand:lukoil', 850]]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
                weightByFacet,
            );

            expect(result).toBe(18);
        });

        it('picks the higher of a flat rule and a reached weight tier', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({ percent: 10, minWeightKg: null }),
                rule({ percent: 20, minWeightKg: 1000 }),
            ]);
            const weightByFacet = new Map([['brand:lukoil', 1200]]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
                weightByFacet,
            );

            expect(result).toBe(20);
        });

        it('a flat rule still wins when no weight tier is reached', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({ percent: 10, minWeightKg: null }),
                rule({ percent: 20, minWeightKg: 1000 }),
            ]);
            const weightByFacet = new Map([['brand:lukoil', 200]]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
                weightByFacet,
            );

            expect(result).toBe(10);
        });

        it('defaults weightByFacet to empty (catalog display) — tiered rules never match', async () => {
            mockQb.getMany.mockResolvedValue([rule({ percent: 20, minWeightKg: 500 })]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
            );

            expect(result).toBeNull();
        });

        it('excludes an amount-tiered rule when the spend threshold is not reached', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({ percent: 15, minWeightKg: null, minAmount: 5000000 }),
            ]);
            const amountByFacet = new Map([['brand:lukoil', 3000000]]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
                new Map(),
                amountByFacet,
            );

            expect(result).toBeNull();
        });

        it('includes an amount-tiered rule once the spend threshold is reached', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({ percent: 15, minWeightKg: null, minAmount: 5000000 }),
            ]);
            const amountByFacet = new Map([['brand:lukoil', 5000000]]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
                new Map(),
                amountByFacet,
            );

            expect(result).toBe(15);
        });

        it('picks the higher of a reached weight tier and a reached amount tier', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({ percent: 15, minWeightKg: 500 }),
                rule({ percent: 22, minWeightKg: null, minAmount: 5000000 }),
            ]);
            const weightByFacet = new Map([['brand:lukoil', 600]]);
            const amountByFacet = new Map([['brand:lukoil', 6000000]]);

            const result = await service.getBestPercent(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
                weightByFacet,
                amountByFacet,
            );

            expect(result).toBe(22);
        });

        describe('grant scope', () => {
            it('excludes a customer-scoped grant rule when counterpartyId does not match', async () => {
                mockQb.getMany.mockResolvedValue([rule({ id: 9, percent: 99 })]);
                mockRepo.find.mockResolvedValue([
                    {
                        discountRuleId: '9',
                        scopeType: 'customer',
                        counterparties: [{ id: '3' }],
                    },
                ]);

                const result = await service.getBestPercent(
                    mockCtx,
                    'WHOLESALE',
                    [{ facetCode: 'brand', valueCode: 'lukoil' }],
                    now,
                    new Map(),
                    new Map(),
                    '2',
                );

                expect(result).toBeNull();
            });

            it('includes a customer-scoped grant rule when counterpartyId matches', async () => {
                mockQb.getMany.mockResolvedValue([rule({ id: 9, percent: 99 })]);
                mockRepo.find.mockResolvedValue([
                    {
                        discountRuleId: '9',
                        scopeType: 'customer',
                        counterparties: [{ id: '2' }],
                    },
                ]);

                const result = await service.getBestPercent(
                    mockCtx,
                    'WHOLESALE',
                    [{ facetCode: 'brand', valueCode: 'lukoil' }],
                    now,
                    new Map(),
                    new Map(),
                    '2',
                );

                expect(result).toBe(99);
            });

            it('excludes a customer-scoped grant rule when counterpartyId is unknown (null)', async () => {
                mockQb.getMany.mockResolvedValue([rule({ id: 9, percent: 99 })]);
                mockRepo.find.mockResolvedValue([
                    {
                        discountRuleId: '9',
                        scopeType: 'customer',
                        counterparties: [{ id: '2' }],
                    },
                ]);

                const result = await service.getBestPercent(
                    mockCtx,
                    'WHOLESALE',
                    [{ facetCode: 'brand', valueCode: 'lukoil' }],
                    now,
                );

                expect(result).toBeNull();
            });

            it('includes a scopeType "all" grant rule regardless of counterpartyId', async () => {
                mockQb.getMany.mockResolvedValue([rule({ id: 9, percent: 12 })]);
                mockRepo.find.mockResolvedValue([
                    { discountRuleId: '9', scopeType: 'all', counterparties: [] },
                ]);

                const result = await service.getBestPercent(
                    mockCtx,
                    'WHOLESALE',
                    [{ facetCode: 'brand', valueCode: 'lukoil' }],
                    now,
                    new Map(),
                    new Map(),
                    '999',
                );

                expect(result).toBe(12);
            });

            it('a rule with no associated grant stays global (plain ERP-sourced rule)', async () => {
                mockQb.getMany.mockResolvedValue([rule({ id: 9, percent: 10 })]);
                mockRepo.find.mockResolvedValue([]);

                const result = await service.getBestPercent(
                    mockCtx,
                    'WHOLESALE',
                    [{ facetCode: 'brand', valueCode: 'lukoil' }],
                    now,
                    new Map(),
                    new Map(),
                    'some-unrelated-counterparty',
                );

                expect(result).toBe(10);
            });
        });
    });

    describe('getTiers', () => {
        it('returns an empty array when no rules match the facet', async () => {
            mockQb.getMany.mockResolvedValue([]);

            const result = await service.getTiers(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'castrol' }],
                now,
            );

            expect(result).toEqual([]);
        });

        it('excludes flat rules (no threshold) — those surface via compareAtPrice, not the badge', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({ percent: 10, minWeightKg: null, minAmount: null }),
            ]);

            const result = await service.getTiers(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
            );

            expect(result).toEqual([]);
        });

        it('returns ladder rungs sorted ascending by threshold', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({ percent: 20, minWeightKg: 1000 }),
                rule({ percent: 15, minWeightKg: 500 }),
                rule({ percent: 18, minWeightKg: 800 }),
            ]);

            const result = await service.getTiers(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
            );

            expect(result.map(t => t.percent)).toEqual([15, 18, 20]);
            expect(result.map(t => t.minWeightKg)).toEqual([500, 800, 1000]);
        });

        it('ignores tiers for a facet the variant does not match', async () => {
            mockQb.getMany.mockResolvedValue([
                rule({
                    facetCode: 'brand',
                    facetValueCode: 'castrol',
                    percent: 15,
                    minAmount: 200000,
                }),
            ]);

            const result = await service.getTiers(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil' }],
                now,
            );

            expect(result).toEqual([]);
        });
    });

    describe('findByPriceType', () => {
        it('filters by priceTypeCode when provided, unbounded (inherently small set)', async () => {
            mockRepo.find.mockResolvedValue([]);
            await service.findByPriceType(mockCtx, 'WHOLESALE');
            expect(mockRepo.find).toHaveBeenCalledWith({
                where: { priceTypeCode: 'WHOLESALE' },
                order: { validTo: 'DESC' },
                take: undefined,
            });
        });

        it('returns every rule across all price types when omitted, bounded at 200 by default (issue #39)', async () => {
            mockRepo.find.mockResolvedValue([]);
            await service.findByPriceType(mockCtx);
            expect(mockRepo.find).toHaveBeenCalledWith({
                where: {},
                order: { validTo: 'DESC' },
                take: 200,
            });
        });

        it('respects an explicit take override', async () => {
            mockRepo.find.mockResolvedValue([]);
            await service.findByPriceType(mockCtx, undefined, 50);
            expect(mockRepo.find).toHaveBeenCalledWith({
                where: {},
                order: { validTo: 'DESC' },
                take: 50,
            });
        });
    });
});
