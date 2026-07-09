import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import type { ApprovalRequestService } from '@mivend/plugin-approval-workflow';

import { DiscountGrantService } from '../../discount-grant.service';
import { DiscountRuleService } from '../../discount-rule.service';

function mockCtx(permissions: string[]) {
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
    let service: DiscountGrantService;

    beforeEach(() => {
        discountRuleService = { upsert: vi.fn(async (..._args: unknown[]) => ({})) };
        approvalRequestService = {
            createRequest: vi.fn(async () => ({ id: 'req-1' })),
            decide: vi.fn(),
        };
        service = new DiscountGrantService(
            discountRuleService as unknown as DiscountRuleService,
            approvalRequestService as unknown as ApprovalRequestService,
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
    });
});
