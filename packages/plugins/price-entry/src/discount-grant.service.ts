import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { And, Brackets, In, LessThanOrEqual, MoreThan } from 'typeorm';
import { CustomPermission } from '@mivend/plugin-access-control';
import {
    ApprovalRequest,
    ApprovalRequestService,
    ApprovalStepDecision,
} from '@mivend/plugin-approval-workflow';
import { Counterparty } from '@mivend/plugin-counterparty';

import { DiscountRuleService } from './discount-rule.service';
import { DiscountGrant, DiscountGrantScopeType } from './discount-grant.entity';
import { DiscountRule } from './discount-rule.entity';

export interface DiscountGrantForCustomer {
    id: ID;
    facetValueCode: string | null;
    percent: number;
    validTo: Date;
    scopeType: DiscountGrantScopeType;
}

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
    // Omitted/empty means the grant applies company-wide (DiscountGrant.scopeType = 'all');
    // provided means it applies only to these counterparties (scopeType = 'customer'), all
    // sharing the same validTo — see DiscountGrant entity doc comment.
    counterpartyIds?: string[] | null;
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
        private connection: TransactionalConnection,
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
            counterpartyIds: input.counterpartyIds ?? null,
            requestedByJustification: input.justification,
        };
        return this.approvalRequestService.createRequest(
            ctx,
            DISCOUNT_GRANT_REQUEST_TYPE,
            payload as unknown as Record<string, unknown>,
        );
    }

    // Once approved, materializes the DiscountRule (the price-type/facet policy) and a
    // DiscountGrant (the customer-facing record the dashboard's "expiring soon" banner reads) —
    // the generic approval-workflow engine never knows this requestType means "create these",
    // same composition pattern as PriceAdjustmentService.decideAndApply().
    async decideAndApply(
        ctx: RequestContext,
        requestId: ID,
        decision: ApprovalStepDecision,
        comment?: string,
    ): Promise<ApprovalRequest> {
        const request = await this.approvalRequestService.decide(ctx, requestId, decision, comment);
        if (request.status === 'approved' && request.requestType === DISCOUNT_GRANT_REQUEST_TYPE) {
            const payload = JSON.parse(request.payload) as DiscountGrantPayload;
            const rule = await this.discountRuleService.upsert(ctx, {
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

            const counterpartyIds = payload.counterpartyIds ?? [];
            const counterparties = counterpartyIds.length
                ? await this.connection
                      .getRepository(ctx, Counterparty)
                      .findBy({ id: In(counterpartyIds) })
                : [];

            const grantRepo = this.connection.getRepository(ctx, DiscountGrant);
            const grant = grantRepo.create({
                discountRuleId: String(rule.id),
                scopeType: counterparties.length ? 'customer' : 'all',
                validTo: new Date(payload.validTo),
                sourceApprovalRequestId: String(request.id),
                justification: payload.justification,
                counterparties,
            });
            await grantRepo.save(grant);
        }
        return request;
    }

    // Powers the Customer Detail page's Discounts tab — a customer must only see grants that
    // actually apply to them: company-wide (scopeType 'all') or explicitly scoped to their
    // counterparty id. Without this filter, the tab previously showed every DiscountRule
    // matching the customer's price type, including grants scoped to a *different* customer.
    async findForCounterparty(
        ctx: RequestContext,
        counterpartyId: ID,
    ): Promise<DiscountGrantForCustomer[]> {
        const grants = await this.connection
            .getRepository(ctx, DiscountGrant)
            .createQueryBuilder('grant')
            .leftJoinAndSelect('grant.counterparties', 'counterparty')
            .where(
                new Brackets(qb => {
                    qb.where('grant.scopeType = :all', { all: 'all' }).orWhere(
                        'counterparty.id = :counterpartyId',
                        { counterpartyId },
                    );
                }),
            )
            .orderBy('grant.validTo', 'DESC')
            .getMany();
        if (grants.length === 0) return [];

        const ruleIds = [...new Set(grants.map(g => g.discountRuleId))];
        const rules = await this.connection
            .getRepository(ctx, DiscountRule)
            .findBy({ id: In(ruleIds) });
        const ruleById = new Map(rules.map(r => [String(r.id), r]));

        return grants
            .map(grant => {
                const rule = ruleById.get(grant.discountRuleId);
                if (!rule) return null;
                return {
                    id: grant.id,
                    facetValueCode: rule.facetValueCode,
                    percent: rule.percent,
                    validTo: grant.validTo,
                    scopeType: grant.scopeType,
                };
            })
            .filter((g): g is DiscountGrantForCustomer => g !== null);
    }

    // Powers the /discounts registry's Customer column — the full list of materialized grants
    // (not just expiring ones), each with its counterparties, so the manager portal can show
    // who a discount actually belongs to instead of only the price-type/facet policy.
    // Bounded at 200 as an interim stopgap (issue #39) — see DiscountRuleService.findByPriceType's
    // comment for why a true paginated fix of the merged /discounts view wasn't attempted this
    // session. Superseded by findForRuleIds for /discounts' now-real-paginated view — kept for
    // any other caller that genuinely wants "all" (there is none left as of this fix, but the
    // 200 cap is a safe fallback rather than a silent full unbounded load).
    async findAll(ctx: RequestContext, take = 200): Promise<DiscountGrant[]> {
        return this.connection.getRepository(ctx, DiscountGrant).find({
            relations: ['counterparties'],
            order: { validTo: 'DESC' },
            take,
        });
    }

    // Real fix for /discounts' Customer column (issue #39): scoped to exactly the rule ids on
    // the current paginated page (DiscountRuleService.findAllPaginated), so this stays bounded
    // by `take` (e.g. 20) instead of the old blanket 200-row cap.
    async findForRuleIds(ctx: RequestContext, ruleIds: ID[]): Promise<DiscountGrant[]> {
        if (ruleIds.length === 0) return [];
        return this.connection.getRepository(ctx, DiscountGrant).find({
            where: { discountRuleId: In(ruleIds.map(String)) },
            relations: ['counterparties'],
        });
    }

    // Feeds the manager portal dashboard's "discount grants expiring soon" banner — only
    // customer-scoped grants are meaningful there (a company-wide grant expiring isn't
    // "renewal review for a specific customer", it's a catalog-wide policy change, already
    // visible on /discounts).
    async findExpiringSoon(ctx: RequestContext, withinDays: number): Promise<DiscountGrant[]> {
        const now = new Date();
        const horizon = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
        return this.connection.getRepository(ctx, DiscountGrant).find({
            where: { scopeType: 'customer', validTo: And(MoreThan(now), LessThanOrEqual(horizon)) },
            relations: ['counterparties'],
            order: { validTo: 'ASC' },
        });
    }
}
