import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    ForbiddenError,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { And, Brackets, In, LessThanOrEqual, MoreThan } from 'typeorm';
import { documentNumberSearchTerm } from 'shared';
import { NumberingService } from '@mivend/plugin-numbering';
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
import { DiscountRegistryService, EXPIRING_SOON_DAYS } from './discount-registry.service';

// Returns only materialized DiscountGrant rows, never pending or rejected approval requests.
// So there is no pending/rejected state to filter by (unlike DiscountRegistryFilterStatus).
export type DiscountGrantFilterStatus = 'active' | 'expiring-soon' | 'expired';

export interface DiscountGrantForCustomer {
    id: ID;
    number: string;
    createdAt: Date;
    facetValueCode: string | null;
    percent: number;
    validTo: Date;
    scopeType: DiscountGrantScopeType;
    // Computed server-side so the client never re-derives it with its own clock.
    // Browser time can disagree with the SQL status filter, mismatching the active filter chip.
    status: DiscountGrantFilterStatus;
}

export interface DiscountGrantsForCounterpartyOptions {
    take?: number;
    skip?: number;
    // Substring match against the grant's own number (DiscountGrant.number).
    search?: string;
    status?: DiscountGrantFilterStatus;
}

const DISCOUNT_GRANT_REQUEST_TYPE = 'discountGrantApproval';

// Mirrors findAllPaginated's SQL status logic; keep EXPIRING_SOON_DAYS shared.
// Pass the same `now` as the SQL filter; a default Date.now() can flip the status between them.
function computeGrantStatus(validTo: Date, now: Date = new Date()): DiscountGrantFilterStatus {
    if (validTo.getTime() < now.getTime()) return 'expired';
    const soon = now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
    if (validTo.getTime() < soon) return 'expiring-soon';
    return 'active';
}

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
    // Omitted/empty means company-wide (scopeType 'all'); otherwise scopeType 'customer'.
    // All scoped counterparties share the same validTo.
    counterpartyIds?: string[] | null;
}

interface DiscountGrantPayload extends DiscountGrantInput {
    requestedByJustification: string;
}

// Unlike priceAdjustmentApproval, a discount grant always needs approval; no direct-apply tier.
// See docs/ai/manager-portal-concept.md §4.1, item 2.
@Injectable()
export class DiscountGrantService {
    constructor(
        private discountRuleService: DiscountRuleService,
        private approvalRequestService: ApprovalRequestService,
        private connection: TransactionalConnection,
        private discountRegistryService: DiscountRegistryService,
        private numberingService: NumberingService,
    ) {}

    async requestGrant(ctx: RequestContext, input: DiscountGrantInput): Promise<ApprovalRequest> {
        if (!ctx.userHasPermissions([CustomPermission.RequestDiscountGrantApproval.Permission])) {
            throw new ForbiddenError();
        }
        // A renewal must carry its own non-empty justification; pre-filling from the prior one is fine.
        // No algorithmic 'unchanged' check (unreliable for free text); the approver's review is the control.
        if (!input.justification || input.justification.trim().length === 0) {
            throw new UserInputError('justification is required to request a discount grant');
        }

        // Vendure's ID scalar coerces [ID!] input to a number under the default id strategy.
        // Stringify explicitly so it matches the string ids returned by counterparties().
        const counterpartyIds = input.counterpartyIds?.map(String) ?? null;

        const payload: DiscountGrantPayload = {
            ...input,
            facetCode: input.facetCode ?? null,
            facetValueCode: input.facetValueCode ?? null,
            minWeightKg: input.minWeightKg ?? null,
            minAmount: input.minAmount ?? null,
            supersedesDiscountRuleId: input.supersedesDiscountRuleId ?? null,
            counterpartyIds,
            requestedByJustification: input.justification,
        };
        const request = await this.approvalRequestService.createRequest(
            ctx,
            DISCOUNT_GRANT_REQUEST_TYPE,
            payload as unknown as Record<string, unknown>,
        );

        await this.discountRegistryService.createFromRequest(ctx, {
            approvalRequestId: request.id,
            priceTypeCode: input.priceTypeCode,
            facetCode: input.facetCode ?? null,
            facetValueCode: input.facetValueCode ?? null,
            percent: input.percent,
            validFrom: new Date(input.validFrom),
            validTo: new Date(input.validTo),
            justification: input.justification,
            counterpartyIds,
        });

        return request;
    }

    // The generic approval engine doesn't know this requestType creates rules/grants.
    // Same composition pattern as PriceAdjustmentService.decideAndApply().
    async decideAndApply(
        ctx: RequestContext,
        requestId: ID,
        decision: ApprovalStepDecision,
        comment?: string,
    ): Promise<ApprovalRequest> {
        const request = await this.approvalRequestService.decide(ctx, requestId, decision, comment);
        if (request.requestType !== DISCOUNT_GRANT_REQUEST_TYPE) return request;

        if (request.status === 'approved') {
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
                number: await this.numberingService.next(ctx, 'discount-grant'),
                discountRuleId: String(rule.id),
                scopeType: counterparties.length ? 'customer' : 'all',
                validTo: new Date(payload.validTo),
                sourceApprovalRequestId: String(request.id),
                counterparties,
            });
            await grantRepo.save(grant);

            await this.discountRegistryService.markDecided(
                ctx,
                request.id,
                'materialized',
                rule.id,
            );
        } else if (request.status === 'rejected') {
            await this.discountRegistryService.markDecided(ctx, request.id, 'rejected');
        }
        return request;
    }

    // Must filter to grants applying to this customer: scopeType 'all' or matching counterparty id.
    // Server-side paginated: expired grants are never deleted, so the list grows unbounded.
    async findForCounterparty(
        ctx: RequestContext,
        counterpartyId: ID,
        options: DiscountGrantsForCounterpartyOptions = {},
    ): Promise<PaginatedList<DiscountGrantForCustomer>> {
        const take = options.take ?? 50;
        const skip = options.skip ?? 0;
        // Reuse one `now` for both the SQL status filter and computeGrantStatus() per row.
        // Otherwise a grant can flip sides of the threshold between the filter query and its label.
        const now = new Date();

        const qb = this.connection
            .getRepository(ctx, DiscountGrant)
            .createQueryBuilder('grant')
            .leftJoinAndSelect('grant.counterparties', 'counterparty')
            .where(
                new Brackets(qb2 => {
                    qb2.where('grant.scopeType = :all', { all: 'all' }).orWhere(
                        'counterparty.id = :counterpartyId',
                        { counterpartyId },
                    );
                }),
            );

        if (options.search) {
            qb.andWhere('grant.number ILIKE :search', {
                search: documentNumberSearchTerm(options.search),
            });
        }
        if (options.status) {
            const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);
            if (options.status === 'expired') {
                qb.andWhere('grant.validTo < :now', { now });
            } else if (options.status === 'expiring-soon') {
                qb.andWhere('grant.validTo >= :now AND grant.validTo < :soon', { now, soon });
            } else {
                qb.andWhere('grant.validTo >= :soon', { soon });
            }
        }

        // Plain getCount() is safe: the counterparty left-join never multiplies rows here.
        // Company-wide grants join as one NULL row; the WHERE narrows scoped grants to one counterparty.
        const totalItems = await qb.getCount();

        const grants = await qb
            .orderBy('grant.validTo', 'DESC')
            .addOrderBy('grant.id', 'DESC')
            .skip(skip)
            .take(take)
            .getMany();

        if (grants.length === 0) return { items: [], totalItems };

        const ruleIds = [...new Set(grants.map(g => g.discountRuleId))];
        const rules = await this.connection
            .getRepository(ctx, DiscountRule)
            .findBy({ id: In(ruleIds) });
        const ruleById = new Map(rules.map(r => [String(r.id), r]));

        const items = grants
            .map(grant => {
                const rule = ruleById.get(grant.discountRuleId);
                if (!rule) return null;
                return {
                    id: grant.id,
                    number: grant.number,
                    createdAt: grant.createdAt,
                    facetValueCode: rule.facetValueCode,
                    percent: rule.percent,
                    validTo: grant.validTo,
                    scopeType: grant.scopeType,
                    status: computeGrantStatus(grant.validTo, now),
                };
            })
            .filter((g): g is DiscountGrantForCustomer => g !== null);
        return { items, totalItems };
    }

    // Only customer-scoped grants: a company-wide expiry is a catalog-wide policy change.
    // Those are already visible on /discounts.
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
