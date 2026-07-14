import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, UserInputError } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { ApprovalRequestService } from '@mivend/plugin-approval-workflow';

import { DiscountGrantService } from '../../discount-grant.service';
import { DiscountRuleService } from '../../discount-rule.service';
import type { DiscountRegistryService } from '../../discount-registry.service';

function mockCtx(permissions: string[]): RequestContext {
    return {
        userHasPermissions: (p: string[]) => p.some(x => permissions.includes(x)),
    } as unknown as RequestContext;
}

const validInput = {
    priceTypeCode: 'WHOLESALE',
    facetCode: 'brand',
    facetValueCode: 'acme',
    percent: 7,
    validFrom: '2026-08-01T00:00:00.000Z',
    validTo: '2026-11-01T00:00:00.000Z',
    justification: 'Renewed for Q4, volume held steady',
};

describe('DiscountGrantService', () => {
    let discountRuleService: { upsert: ReturnType<typeof vi.fn> };
    let approvalRequestService: {
        createRequest: ReturnType<typeof vi.fn>;
        decide: ReturnType<typeof vi.fn>;
    };
    let grantRepo: {
        create: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
        find: ReturnType<typeof vi.fn>;
    };
    let counterpartyRepo: { findBy: ReturnType<typeof vi.fn> };
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let discountRegistryService: {
        createFromRequest: ReturnType<typeof vi.fn>;
        markDecided: ReturnType<typeof vi.fn>;
    };
    let service: DiscountGrantService;

    beforeEach(() => {
        discountRuleService = { upsert: vi.fn(async (..._args: unknown[]) => ({ id: 'rule-1' })) };
        approvalRequestService = {
            createRequest: vi.fn(async () => ({ id: 'req-1' })),
            decide: vi.fn(),
        };
        grantRepo = {
            create: vi.fn((input: unknown) => input),
            save: vi.fn(async (input: unknown) => input),
            find: vi.fn(async () => []),
        };
        counterpartyRepo = { findBy: vi.fn(async () => []) };
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
                entity?.name === 'Counterparty' ? counterpartyRepo : grantRepo,
            ),
        };
        discountRegistryService = {
            createFromRequest: vi.fn(async () => undefined),
            markDecided: vi.fn(async () => undefined),
        };
        service = new DiscountGrantService(
            discountRuleService as unknown as DiscountRuleService,
            approvalRequestService as unknown as ApprovalRequestService,
            connection as unknown as TransactionalConnection,
            discountRegistryService as unknown as DiscountRegistryService,
        );
    });

    describe('requestGrant', () => {
        it('always creates an approval request — there is no direct-apply tier', async () => {
            const ctx = mockCtx(['RequestDiscountGrantApproval']);
            const result = await service.requestGrant(ctx, validInput);

            expect(approvalRequestService.createRequest).toHaveBeenCalledWith(
                ctx,
                'discountGrantApproval',
                expect.objectContaining({ priceTypeCode: 'WHOLESALE', percent: 7 }),
            );
            expect(result).toEqual({ id: 'req-1' });
            expect(discountRuleService.upsert).not.toHaveBeenCalled();
        });

        it('rejects a caller without RequestDiscountGrantApproval', async () => {
            const ctx = mockCtx([]);
            await expect(service.requestGrant(ctx, validInput)).rejects.toThrow(ForbiddenError);
            expect(approvalRequestService.createRequest).not.toHaveBeenCalled();
        });

        it('rejects an empty justification instead of creating an unreviewable request', async () => {
            const ctx = mockCtx(['RequestDiscountGrantApproval']);
            await expect(
                service.requestGrant(ctx, { ...validInput, justification: '   ' }),
            ).rejects.toThrow(UserInputError);
            expect(approvalRequestService.createRequest).not.toHaveBeenCalled();
        });

        it("stores counterpartyIds as strings even if Vendure's ID scalar coerced them to numbers", async () => {
            const ctx = mockCtx(['RequestDiscountGrantApproval']);
            // Vendure's ID scalar coerces `[ID!]` GraphQL input to the entity id strategy's
            // native type (a number, under the default auto-increment strategy) — this simulates
            // what actually arrives at the resolver, not what the TS type declares.
            await service.requestGrant(ctx, {
                ...validInput,
                counterpartyIds: [1, 2] as unknown as string[],
            });

            expect(approvalRequestService.createRequest).toHaveBeenCalledWith(
                ctx,
                'discountGrantApproval',
                expect.objectContaining({ counterpartyIds: ['1', '2'] }),
            );
        });
    });

    describe('decideAndApply', () => {
        it('materializes a DiscountRule once the request is approved', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-1',
                status: 'approved',
                requestType: 'discountGrantApproval',
                payload: JSON.stringify({ ...validInput, supersedesDiscountRuleId: null }),
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-1', 'approved', 'ok');

            expect(discountRuleService.upsert).toHaveBeenCalledWith(
                ctx,
                expect.objectContaining({
                    erpId: 'portal-req-1',
                    priceTypeCode: 'WHOLESALE',
                    facetCode: 'brand',
                    facetValueCode: 'acme',
                    percent: 7,
                }),
            );
        });

        it('does not materialize a rule when the request is rejected', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-1',
                status: 'rejected',
                requestType: 'discountGrantApproval',
                payload: '{}',
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-1', 'rejected');

            expect(discountRuleService.upsert).not.toHaveBeenCalled();
        });

        it('does not materialize a rule for a different requestType', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-2',
                status: 'approved',
                requestType: 'priceAdjustmentApproval',
                payload: '{}',
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-2', 'approved');

            expect(discountRuleService.upsert).not.toHaveBeenCalled();
        });

        it('creates a company-wide DiscountGrant when no counterpartyIds are given', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-1',
                status: 'approved',
                requestType: 'discountGrantApproval',
                payload: JSON.stringify({ ...validInput, supersedesDiscountRuleId: null }),
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-1', 'approved', 'ok');

            expect(counterpartyRepo.findBy).not.toHaveBeenCalled();
            expect(grantRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    scopeType: 'all',
                    discountRuleId: 'rule-1',
                    counterparties: [],
                }),
            );
        });

        it('creates a customer-scoped DiscountGrant when counterpartyIds are given', async () => {
            counterpartyRepo.findBy.mockResolvedValue([{ id: 'cp-1' }, { id: 'cp-2' }]);
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-1',
                status: 'approved',
                requestType: 'discountGrantApproval',
                payload: JSON.stringify({
                    ...validInput,
                    supersedesDiscountRuleId: null,
                    counterpartyIds: ['cp-1', 'cp-2'],
                }),
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-1', 'approved', 'ok');

            expect(grantRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    scopeType: 'customer',
                    counterparties: [{ id: 'cp-1' }, { id: 'cp-2' }],
                }),
            );
        });
    });

    describe('findExpiringSoon', () => {
        it('queries only customer-scoped grants, ordered by soonest expiry', async () => {
            const ctx = mockCtx([]);
            await service.findExpiringSoon(ctx, 14);

            expect(grantRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ scopeType: 'customer' }),
                    relations: ['counterparties'],
                    order: { validTo: 'ASC' },
                }),
            );
        });
    });

    describe('DiscountRegistryService integration', () => {
        it('creates a registry entry when a grant is requested', async () => {
            const ctx = mockCtx(['RequestDiscountGrantApproval']);
            await service.requestGrant(ctx, validInput);

            expect(discountRegistryService.createFromRequest).toHaveBeenCalledWith(
                ctx,
                expect.objectContaining({ approvalRequestId: 'req-1', priceTypeCode: 'WHOLESALE' }),
            );
        });

        it('marks the registry entry materialized when approved', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-1',
                status: 'approved',
                requestType: 'discountGrantApproval',
                payload: JSON.stringify({ ...validInput, supersedesDiscountRuleId: null }),
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-1', 'approved', 'ok');

            expect(discountRegistryService.markDecided).toHaveBeenCalledWith(
                ctx,
                'req-1',
                'materialized',
                'rule-1',
            );
        });

        it('marks the registry entry rejected when rejected', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-1',
                status: 'rejected',
                requestType: 'discountGrantApproval',
                payload: '{}',
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-1', 'rejected');

            expect(discountRegistryService.markDecided).toHaveBeenCalledWith(
                ctx,
                'req-1',
                'rejected',
            );
        });
    });
});
