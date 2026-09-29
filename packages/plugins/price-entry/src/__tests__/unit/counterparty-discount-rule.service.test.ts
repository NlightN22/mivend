import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyDiscountRuleService } from '../../counterparty-discount-rule.service';

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

function ruleInput(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        erpId: 'dr-1',
        recipientType: 'counterparty',
        recipientErpId: 'cp-erp-1',
        productErpId: null,
        condition: 'byQuantity',
        conditionValue: 10,
        percent: 15,
        limitAmount: null,
        validFrom: new Date('2026-07-01T00:00:00.000Z'),
        validTo: new Date('2026-07-31T00:00:00.000Z'),
        sourceVersion: '5',
        ...overrides,
    };
}

function activeRule(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        erpId: 'dr-existing',
        recipientType: 'counterparty',
        recipientErpId: 'cp-erp-1',
        productErpId: null,
        condition: 'byQuantity',
        conditionValue: 5,
        percent: 10,
        active: true,
        sourceVersion: '3',
        validFrom: new Date('2026-07-01T00:00:00.000Z'),
        validTo: new Date('2026-07-31T00:00:00.000Z'),
        ...overrides,
    };
}

function fakeOrder(overrides: Partial<Order> = {}): Order {
    return {
        lines: [],
        totalWithTax: 0,
        customFields: {},
        ...overrides,
    } as unknown as Order;
}

describe('CounterpartyDiscountRuleService (issue #108)', () => {
    let service: CounterpartyDiscountRuleService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo.createQueryBuilder.mockReturnValue(mockQb);
        service = new CounterpartyDiscountRuleService(
            mockConnection as unknown as TransactionalConnection,
        );
    });

    describe('upsertCounterpartyRule — conflict prevention', () => {
        it('creates a new rule with the other two trigger shapes forced null when there is no conflict', async () => {
            mockQb.getMany.mockResolvedValue([]); // no conflicts
            mockRepo.findOne.mockResolvedValue(null);
            const input = ruleInput();
            mockRepo.create.mockReturnValue(input);
            mockRepo.save.mockResolvedValue(input);

            await service.upsertCounterpartyRule(mockCtx, input as never);

            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    erpId: 'dr-1',
                    priceTypeCode: null,
                    facetCode: null,
                    triggerProductErpId: null,
                    operationKind: null,
                    recipientType: 'counterparty',
                    recipientErpId: 'cp-erp-1',
                    active: true,
                }),
            );
        });

        it('ERP-vs-ERP: a newer event (higher sourceVersion) deactivates the older conflicting rule and activates itself', async () => {
            const conflict = activeRule({ sourceVersion: '3' });
            mockQb.getMany.mockResolvedValue([conflict]);
            mockRepo.save.mockImplementation(async (r: unknown) => r);
            mockRepo.findOne.mockResolvedValue(null);
            const input = ruleInput({ sourceVersion: '7' });
            mockRepo.create.mockReturnValue(input);

            await service.upsertCounterpartyRule(mockCtx, input as never);

            expect(conflict.active).toBe(false);
            expect(mockRepo.save).toHaveBeenCalledWith(conflict);
            expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
        });

        it('ERP-vs-ERP: a stale event (lower sourceVersion) is skipped and the active conflict is returned unchanged', async () => {
            const conflict = activeRule({ sourceVersion: '9' });
            mockQb.getMany.mockResolvedValue([conflict]);
            const input = ruleInput({ sourceVersion: '2' });

            const result = await service.upsertCounterpartyRule(mockCtx, input as never);

            expect(result).toBe(conflict);
            expect(mockRepo.create).not.toHaveBeenCalled();
            expect(mockRepo.save).not.toHaveBeenCalled();
        });

        it('ERP-vs-ERP: an equal sourceVersion is treated as stale (not newer), same as a lower one', async () => {
            const conflict = activeRule({ sourceVersion: '5' });
            mockQb.getMany.mockResolvedValue([conflict]);
            const input = ruleInput({ sourceVersion: '5' });

            const result = await service.upsertCounterpartyRule(mockCtx, input as never);

            expect(result).toBe(conflict);
            expect(mockRepo.create).not.toHaveBeenCalled();
        });

        it('ERP-vs-portal: never auto-overwrites a portal-origin conflict — writes itself inactive instead', async () => {
            const portalConflict = activeRule({ erpId: 'portal-req-42' });
            mockQb.getMany.mockResolvedValue([portalConflict]);
            mockRepo.findOne.mockResolvedValue(null);
            const input = ruleInput();
            mockRepo.create.mockReturnValue(input);
            mockRepo.save.mockResolvedValue(input);

            await service.upsertCounterpartyRule(mockCtx, input as never);

            expect(portalConflict.active).toBe(true); // untouched
            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ active: false }),
            );
        });

        it('scopes the conflict lookup by recipientType + recipientErpId + productErpId (null productErpId queried as IS NULL)', async () => {
            mockQb.getMany.mockResolvedValue([]);
            mockRepo.findOne.mockResolvedValue(null);
            const input = ruleInput({ productErpId: null });
            mockRepo.create.mockReturnValue(input);
            mockRepo.save.mockResolvedValue(input);

            await service.upsertCounterpartyRule(mockCtx, input as never);

            expect(mockQb.andWhere).toHaveBeenCalledWith('dr.productErpId IS NULL');
        });

        it('updates an existing row matched by erpId (repeat delivery of the same rule)', async () => {
            mockQb.getMany.mockResolvedValue([]);
            const existing = ruleInput({ percent: 5 });
            mockRepo.findOne.mockResolvedValue(existing);
            mockRepo.save.mockResolvedValue(existing);

            await service.upsertCounterpartyRule(mockCtx, ruleInput({ percent: 25 }) as never);

            expect(existing.percent).toBe(25);
            expect(mockRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('getBestPercent', () => {
        it('returns null with no order context (catalog display, never triggers a counterparty rule)', async () => {
            const result = await service.getBestPercent(
                mockCtx,
                undefined,
                null,
                'prod-1',
                new Map(),
                0,
                now,
            );
            expect(result).toBeNull();
            expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it('returns null when neither a counterparty nor an order contract id is resolvable', async () => {
            const result = await service.getBestPercent(
                mockCtx,
                fakeOrder(),
                null,
                'prod-1',
                new Map([['prod-1', 20]]),
                0,
                now,
            );
            expect(result).toBeNull();
            expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it('byQuantity, product-specific: qualifies once the scoped product quantity reaches conditionValue', async () => {
            mockQb.getMany.mockResolvedValue([
                activeRule({
                    productErpId: 'prod-1',
                    condition: 'byQuantity',
                    conditionValue: 10,
                    percent: 15,
                }),
            ]);
            const result = await service.getBestPercent(
                mockCtx,
                fakeOrder(),
                { erpId: 'cp-erp-1' } as never,
                'prod-1',
                new Map([['prod-1', 10]]),
                0,
                now,
            );
            expect(result).toBe(15);
        });

        it('byQuantity, product-specific: does not qualify below the threshold', async () => {
            mockQb.getMany.mockResolvedValue([
                activeRule({
                    productErpId: 'prod-1',
                    condition: 'byQuantity',
                    conditionValue: 10,
                    percent: 15,
                }),
            ]);
            const result = await service.getBestPercent(
                mockCtx,
                fakeOrder(),
                { erpId: 'cp-erp-1' } as never,
                'prod-1',
                new Map([['prod-1', 9]]),
                0,
                now,
            );
            expect(result).toBeNull();
        });

        it('byQuantity, applies-to-all-products (null productErpId): compares against the order total quantity, not just the priced product', async () => {
            mockQb.getMany.mockResolvedValue([
                activeRule({
                    productErpId: null,
                    condition: 'byQuantity',
                    conditionValue: 20,
                    percent: 8,
                }),
            ]);
            const result = await service.getBestPercent(
                mockCtx,
                fakeOrder(),
                { erpId: 'cp-erp-1' } as never,
                'prod-1',
                new Map([
                    ['prod-1', 3],
                    ['prod-2', 17],
                ]),
                0,
                now,
            );
            expect(result).toBe(8);
        });

        it("byDocumentAmount: compares the order total, regardless of the rule's product scope", async () => {
            mockQb.getMany.mockResolvedValue([
                activeRule({
                    productErpId: 'prod-1',
                    condition: 'byDocumentAmount',
                    conditionValue: 50000,
                    percent: 12,
                }),
            ]);
            const result = await service.getBestPercent(
                mockCtx,
                fakeOrder(),
                { erpId: 'cp-erp-1' } as never,
                'prod-1',
                new Map([['prod-1', 1]]),
                50000,
                now,
            );
            expect(result).toBe(12);
        });

        it('a rule scoped to a different product never matches the priced product', async () => {
            mockQb.getMany.mockResolvedValue([
                activeRule({
                    productErpId: 'prod-other',
                    condition: 'byQuantity',
                    conditionValue: 1,
                    percent: 50,
                }),
            ]);
            const result = await service.getBestPercent(
                mockCtx,
                fakeOrder(),
                { erpId: 'cp-erp-1' } as never,
                'prod-1',
                new Map([['prod-1', 999]]),
                0,
                now,
            );
            expect(result).toBeNull();
        });

        it('picks the highest percent when multiple recipient rules qualify (counterparty and contract combined)', async () => {
            mockQb.getMany.mockResolvedValue([
                activeRule({
                    productErpId: null,
                    condition: 'byQuantity',
                    conditionValue: 1,
                    percent: 10,
                }),
                activeRule({
                    productErpId: null,
                    condition: 'byQuantity',
                    conditionValue: 1,
                    percent: 30,
                }),
            ]);
            const result = await service.getBestPercent(
                mockCtx,
                fakeOrder({ customFields: { erpContractId: 'contract-erp-1' } } as never),
                { erpId: 'cp-erp-1' } as never,
                'prod-1',
                new Map([['prod-1', 5]]),
                0,
                now,
            );
            expect(result).toBe(30);
        });
    });
});
