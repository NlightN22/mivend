import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { DiscountRegistryService } from '../../discount-registry.service';

const mockQb = {
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    take: vi.fn(),
    skip: vi.fn(),
    getManyAndCount: vi.fn(),
};
mockQb.andWhere.mockReturnValue(mockQb);
mockQb.orderBy.mockReturnValue(mockQb);
mockQb.take.mockReturnValue(mockQb);
mockQb.skip.mockReturnValue(mockQb);

const mockRepo = {
    create: vi.fn((input: unknown) => input),
    save: vi.fn(async (input: unknown) => input),
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(() => mockQb),
};

const counterpartyRepo = { findBy: vi.fn(async (): Promise<{ legalName: string }[]> => []) };

const mockConnection = {
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
        service = new DiscountRegistryService(mockConnection as unknown as TransactionalConnection);
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
            mockQb.getManyAndCount.mockResolvedValue([[], 0]);
        });

        it('paginates with defaults when no options are given', async () => {
            await service.findAllPaginated(mockCtx);
            expect(mockQb.take).toHaveBeenCalledWith(20);
            expect(mockQb.skip).toHaveBeenCalledWith(0);
        });

        it('filters by priceTypeCode', async () => {
            await service.findAllPaginated(mockCtx, { priceTypeCode: 'WHOLESALE' });
            expect(mockQb.andWhere).toHaveBeenCalledWith('entry.priceTypeCode = :priceTypeCode', {
                priceTypeCode: 'WHOLESALE',
            });
        });

        it('filters pending/rejected by the status column directly', async () => {
            await service.findAllPaginated(mockCtx, { status: 'pending' });
            expect(mockQb.andWhere).toHaveBeenCalledWith('entry.status = :status', {
                status: 'pending',
            });
        });

        it('filters active/expiring-soon/expired by validTo, scoped to materialized entries', async () => {
            await service.findAllPaginated(mockCtx, { status: 'expired' });
            expect(mockQb.andWhere).toHaveBeenCalledWith('entry.status = :materialized', {
                materialized: 'materialized',
            });
            expect(mockQb.andWhere).toHaveBeenCalledWith(
                'entry.validTo < :now',
                expect.objectContaining({ now: expect.any(Date) }),
            );
        });

        it('builds a search filter across denormalized columns', async () => {
            await service.findAllPaginated(mockCtx, { search: 'acme' });
            expect(mockQb.andWhere).toHaveBeenCalledWith(expect.any(Object));
        });
    });

    describe('countByStatus', () => {
        it('delegates to findAllPaginated with take:0', async () => {
            mockQb.getManyAndCount.mockResolvedValue([[], 3]);
            const count = await service.countByStatus(mockCtx, 'pending');
            expect(count).toBe(3);
            expect(mockQb.take).toHaveBeenCalledWith(0);
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
