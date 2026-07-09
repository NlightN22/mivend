import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { ForbiddenError, RequestContext, UserInputError } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import {
    ApprovalRequest,
    ApprovalRequestService,
    ApprovalStepDecision,
} from '@mivend/plugin-approval-workflow';

import { DiscountRuleService } from './discount-rule.service';

const DISCOUNT_GRANT_REQUEST_TYPE = 'discountGrantApproval';

export interface DiscountGrantInput {
    priceTypeCode: string;
    facetCode?: string | null;
    facetValueCode?: string | null;
    percent: number;
    validFrom: string;
    validTo: string;
    minWeightKg?: number | null;
    minAmount?: number | null;
    justification: string;
    // Links a renewal to the DiscountRule it extends — the approver sees the full renewal
    // chain via this field, per docs/ai/manager-portal-concept.md §4.1.1.
    supersedesDiscountRuleId?: string | null;
}

interface DiscountGrantPayload extends DiscountGrantInput {
    requestedByJustification: string;
}

// Unlike priceAdjustmentApproval (gated by a floor-price threshold), a discount *grant* is
// always a standing policy change — it always requires approval, there is no "apply
// directly within limit" tier here. See docs/ai/manager-portal-concept.md §4.1, item 2.
@Injectable()
export class DiscountGrantService {
    constructor(
        private discountRuleService: DiscountRuleService,
        private approvalRequestService: ApprovalRequestService,
    ) {}

    async requestGrant(ctx: RequestContext, input: DiscountGrantInput): Promise<ApprovalRequest> {
        if (!ctx.userHasPermissions([CustomPermission.RequestDiscountGrantApproval.Permission])) {
            throw new ForbiddenError();
        }
        // §4.1.1 rule #2: a renewal must carry its own justification — pre-filled from the
        // prior rule is fine, but it cannot be empty. Deliberately NOT attempting to detect
        // "unchanged from last time" algorithmically (the concept doc explicitly rejects that
        // as unreliable for free text) — the approver reviewing old vs. new text is the
        // control, not code.
        if (!input.justification || input.justification.trim().length === 0) {
            throw new UserInputError('justification is required to request a discount grant');
        }

        const payload: DiscountGrantPayload = {
            ...input,
            facetCode: input.facetCode ?? null,
            facetValueCode: input.facetValueCode ?? null,
            minWeightKg: input.minWeightKg ?? null,
            minAmount: input.minAmount ?? null,
            supersedesDiscountRuleId: input.supersedesDiscountRuleId ?? null,
            requestedByJustification: input.justification,
        };
        return this.approvalRequestService.createRequest(
            ctx,
            DISCOUNT_GRANT_REQUEST_TYPE,
            payload as unknown as Record<string, unknown>,
        );
    }

    // Once approved, materializes the DiscountRule — the generic approval-workflow engine
    // never knows this requestType means "create a DiscountRule", same composition pattern as
    // PriceAdjustmentService.decideAndApply().
    async decideAndApply(
        ctx: RequestContext,
        requestId: ID,
        decision: ApprovalStepDecision,
        comment?: string,
    ): Promise<ApprovalRequest> {
        const request = await this.approvalRequestService.decide(ctx, requestId, decision, comment);
        if (request.status === 'approved' && request.requestType === DISCOUNT_GRANT_REQUEST_TYPE) {
            const payload = JSON.parse(request.payload) as DiscountGrantPayload;
            await this.discountRuleService.upsert(ctx, {
                // Portal-created rules aren't ERP master data — a stable synthetic id keyed to
                // the approval request itself, distinct from ERP-pushed erpIds.
                erpId: `portal-${request.id}`,
                priceTypeCode: payload.priceTypeCode,
                facetCode: payload.facetCode ?? null,
                facetValueCode: payload.facetValueCode ?? null,
                percent: payload.percent,
                validFrom: new Date(payload.validFrom),
                validTo: new Date(payload.validTo),
                minWeightKg: payload.minWeightKg ?? null,
                minAmount: payload.minAmount ?? null,
            });
        }
        return request;
    }
}
