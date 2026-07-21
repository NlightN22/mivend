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
import { generateDocumentCode } from 'shared';
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

// Distinct from DiscountRegistryFilterStatus (discount-registry.service.ts) — this endpoint only
// ever returns already-materialized DiscountGrant rows, never a pending/rejected approval
// request, so there's no 'pending'/'rejected' state to filter by here.
export type DiscountGrantFilterStatus = 'active' | 'expiring-soon' | 'expired';

export interface DiscountGrantForCustomer {
    id: ID;
    number: string;
    createdAt: Date;
    facetValueCode: string | null;
    percent: number;
    validTo: Date;
    scopeType: DiscountGrantScopeType;
    // Computed server-side (see findForCounterparty) so the manager portal never re-derives this
    // client-side against its own clock — a real bug class this avoids: a client-computed
    // "expiring soon" using the browser's local time can disagree with what the server-side
    // status filter (below) actually matched against, showing a badge that contradicts the
    // active view/filter chip it's sitting under.
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

// Single source of truth for "is this discount grant active / expiring soon / expired" — mirrors
// DiscountRegistryService.findAllPaginated's identical SQL-side computation, kept in sync via the
// shared EXPIRING_SOON_DAYS constant. Callers must pass the same `now` used for any SQL-side
// status filter in the same request (see findForCounterparty) rather than letting this default
// to a fresh `Date.now()`, so a grant can't land on the wrong side of the threshold between the
// filter query and the label attached to its own row.
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
        private discountRegistryService: DiscountRegistryService,
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

        // Vendure's ID scalar coerces GraphQL `[ID!]` input to the entity id strategy's native
        // type (a number, under the default auto-increment strategy) — stringified explicitly
        // so it always matches what `counterparties()` returns (real string ids). See AGENTS.md
        // "Vendure-specific gotchas".
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
                number: generateDocumentCode('DSC'),
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

    // Powers the Customer Detail page's Discounts tab — a customer must only see grants that
    // actually apply to them: company-wide (scopeType 'all') or explicitly scoped to their
    // counterparty id. Without this filter, the tab previously showed every DiscountRule
    // matching the customer's price type, including grants scoped to a *different* customer.
    //
    // Real, server-side paginated + filtered (AGENTS.md "Pagination" rule) — this list is NOT
    // genuinely bounded despite an earlier comment here claiming otherwise: nothing ever removes
    // an expired grant, so it accumulates over the customer's whole lifetime the same way orders/
    // invoices/payments do, one row per approved renewal. `search`/`status` mirror
    // PaymentVisibilityService/InvoiceVisibilityService's shape.
    async findForCounterparty(
        ctx: RequestContext,
        counterpartyId: ID,
        options: DiscountGrantsForCounterpartyOptions = {},
    ): Promise<PaginatedList<DiscountGrantForCustomer>> {
        const take = options.take ?? 50;
        const skip = options.skip ?? 0;
        // One `now` for the whole call — reused by both the SQL status filter below and
        // computeGrantStatus() per returned row, so a grant can never fall on the wrong side of
        // the threshold between the filter query and the label attached to its own row.
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
            qb.andWhere('grant.number ILIKE :search', { search: `%${options.search}%` });
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

        // No row-multiplication risk from the counterparty left-join here worth guarding against
        // with a DISTINCT count: a company-wide grant carries no attached counterparties (the
        // join preserves it as a single NULL-counterparty row), and the WHERE above narrows a
        // customer-scoped grant down to at most the one row matching this specific
        // counterpartyId — plain getCount() is accurate either way.
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
