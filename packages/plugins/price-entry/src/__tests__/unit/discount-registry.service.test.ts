import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import type { NumberingService } from '@mivend/plugin-numbering';
import { DiscountRegistryService } from '../../discount-registry.service';

const mockQb = {
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    addOrderBy: vi.fn(),
    take: vi.fn(),
    skip: vi.fn(),
    getManyAndCount: vi.fn(),
    getCount: vi.fn(),
};
mockQb.andWhere.mockReturnValue(mockQb);
mockQb.orderBy.mockReturnValue(mockQb);
mockQb.addOrderBy.mockReturnValue(mockQb);
mockQb.take.mockReturnValue(mockQb);
mockQb.skip.mockReturnValue(mockQb);

const mockRepo = {
    create: vi.fn((input: unknown) => input),
    save: vi.fn(async (input: unknown) => input),
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(() => mockQb),
    query: vi.fn(),
};

const counterpartyRepo = { findBy: vi.fn(async (): Promise<{ legalName: string }[]> => []) };

const mockConnection = {
    withTransaction: (c: unknown, work: (c: unknown) => unknown) => work(c),
    getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
        entity?.name === 'Counterparty' ? counterpartyRepo : mockRepo,
    ),
};

const mockCtx = {} as unknown as RequestContext;

function entryInput(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        approvalRequestId: 'req-1',
        priceTypeCode: 'WHOLESALE',
        facetCode: 'brand',
        facetValueCode: 'acme',
        percent: 10,
        validFrom: new Date('2026-07-01T00:00:00.000Z'),
        validTo: new Date('2026-07-31T00:00:00.000Z'),
        justification: 'Loyal customer',
        counterpartyIds: null,
        ...overrides,
    };
}

describe('DiscountRegistryService', () => {
    let service: DiscountRegistryService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new DiscountRegistryService(
            mockConnection as unknown as TransactionalConnection,
            { next: vi.fn(async () => '1000000007') } as unknown as NumberingService,
        );
    });

    describe('createFromRequest', () => {
        it('creates a pending entry with no discountRuleId yet', async () => {
            await service.createFromRequest(mockCtx, entryInput() as never);

            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    approvalRequestId: 'req-1',
                    discountRuleId: null,
                    status: 'pending',
                    priceTypeCode: 'WHOLESALE',
                    number: '1000000007',
                }),
            );
            expect(mockRepo.save).toHaveBeenCalledOnce();
        });

        it('resolves customer names for search when counterpartyIds are given', async () => {
            counterpartyRepo.findBy.mockResolvedValueOnce([{ legalName: 'Acme LLC' }]);
            await service.createFromRequest(
                mockCtx,
                entryInput({ counterpartyIds: ['1'] }) as never,
            );

            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ customerNamesForSearch: 'Acme LLC' }),
            );
        });
    });

    describe('markDecided', () => {
        it('is a no-op if no entry exists for the approvalRequestId', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            await service.markDecided(mockCtx, 'req-missing', 'materialized', 'rule-1');
            expect(mockRepo.save).not.toHaveBeenCalled();
        });

        it('transitions to materialized and stores the discountRuleId', async () => {
            const entry = { status: 'pending', discountRuleId: null };
            mockRepo.findOne.mockResolvedValue(entry);

            await service.markDecided(mockCtx, 'req-1', 'materialized', 'rule-1');

            expect(entry.status).toBe('materialized');
            expect(entry.discountRuleId).toBe('rule-1');
            expect(mockRepo.save).toHaveBeenCalledWith(entry);
        });

        it('transitions to rejected without a discountRuleId', async () => {
            const entry = { status: 'pending', discountRuleId: null };
            mockRepo.findOne.mockResolvedValue(entry);

            await service.markDecided(mockCtx, 'req-1', 'rejected');

            expect(entry.status).toBe('rejected');
            expect(entry.discountRuleId).toBeNull();
        });
    });

    describe('findAllPaginated', () => {
        beforeEach(() => {
            mockQb.getCount.mockResolvedValue(0);
            mockQb.getManyAndCount.mockResolvedValue([[], 0]);
        });

        it('paginates with the default page size when no options are given', async () => {
            await service.findAllPaginated(mockCtx);
            expect(mockQb.take).toHaveBeenCalledWith(50);
            expect(mockQb.skip).toHaveBeenCalledWith(0);
        });

        it('clamps a huge or negative take and skip', async () => {
            await service.findAllPaginated(mockCtx, { take: 100000, skip: -5 });
            expect(mockQb.take).toHaveBeenCalledWith(200);
            expect(mockQb.skip).toHaveBeenCalledWith(0);
        });

        it('answers take:0 with a count only', async () => {
            mockQb.getCount.mockResolvedValue(3);
            const result = await service.findAllPaginated(mockCtx, { take: 0 });
            expect(result).toEqual({ items: [], totalItems: 3 });
            expect(mockQb.getManyAndCount).not.toHaveBeenCalled();
        });

        it('applies the allowed price types first, empty list meaning none', async () => {
            await service.findAllPaginated(mockCtx, { allowedPriceTypeCodes: [] });
            expect(mockQb.andWhere.mock.calls[0]).toEqual([
                'entry.priceTypeCode IN (:...allowedPriceTypeCodes)',
                { allowedPriceTypeCodes: [''] },
            ]);
        });

        it('filters by priceTypeCode', async () => {
            await service.findAllPaginated(mockCtx, { priceTypeCode: 'WHOLESALE' });
            expect(mockQb.andWhere).toHaveBeenCalledWith('entry.priceTypeCode = :priceTypeCode', {
                priceTypeCode: 'WHOLESALE',
            });
        });

        it('binds the status view as a parameter against the derived status', async () => {
            await service.findAllPaginated(mockCtx, { status: 'expired' });
            expect(mockQb.andWhere).toHaveBeenCalledWith(expect.stringContaining('= :statusView'), {
                statusView: 'expired',
            });
        });

        it('builds a search filter across the number and denormalized columns', async () => {
            await service.findAllPaginated(mockCtx, { search: 'acme' });
            expect(mockQb.andWhere).toHaveBeenCalledWith(expect.any(Object));
        });

        it('binds builder values as parameters and never inlines them', async () => {
            await service.findAllPaginated(mockCtx, {
                filter: { customer: { contains: "x'; DROP TABLE y; --" } },
            });
            const [sql, params] = mockQb.andWhere.mock.calls.at(-1) as [string, object];
            expect(sql).not.toContain('DROP');
            expect(Object.values(params)).toEqual(["%x'; DROP TABLE y; --%"]);
        });

        it('rejects a field outside the whitelist', async () => {
            await expect(
                service.findAllPaginated(mockCtx, { filter: { justification: { eq: 'x' } } }),
            ).rejects.toBeInstanceOf(UserInputError);
        });

        it('rejects sorting by a field outside the whitelist', async () => {
            await expect(
                service.findAllPaginated(mockCtx, { sort: { justification: 'ASC' } }),
            ).rejects.toBeInstanceOf(UserInputError);
        });
    });

    describe('countByStatus', () => {
        it('delegates to findAllPaginated with take:0', async () => {
            mockQb.getCount.mockResolvedValue(3);
            const count = await service.countByStatus(mockCtx, 'pending');
            expect(count).toBe(3);
            expect(mockQb.getCount).toHaveBeenCalled();
            expect(mockQb.getManyAndCount).not.toHaveBeenCalled();
        });
    });

    describe('backfill', () => {
        it('creates a new entry when none exists yet', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            const written = await service.backfill(mockCtx, [
                {
                    approvalRequestId: 'req-1',
                    discountRuleId: 'rule-1',
                    status: 'materialized',
                    input: entryInput() as never,
                },
            ]);
            expect(written).toBe(1);
            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ approvalRequestId: 'req-1', discountRuleId: 'rule-1' }),
            );
        });

        it('updates an existing entry in place (idempotent)', async () => {
            const existing = { approvalRequestId: 'req-1', status: 'pending' };
            mockRepo.findOne.mockResolvedValue(existing);

            await service.backfill(mockCtx, [
                {
                    approvalRequestId: 'req-1',
                    discountRuleId: 'rule-1',
                    status: 'materialized',
                    input: entryInput() as never,
                },
            ]);

            expect(existing.status).toBe('materialized');
            expect(mockRepo.create).not.toHaveBeenCalled();
            expect(mockRepo.save).toHaveBeenCalledWith(existing);
        });
    });
});
