import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    PaginatedList,
    Permission,
    RequestContext,
    Transaction,
    TransactionalConnection,
} from '@vendure/core';
import { ApprovalRequestService } from '@mivend/plugin-approval-workflow';
import { CustomPermission } from '@mivend/plugin-access-control';

import { DiscountRule } from './discount-rule.entity';
import { DiscountRegistryEntry } from './discount-registry-entry.entity';
import { DiscountRegistryListOptions, DiscountRegistryService } from './discount-registry.service';

const DISCOUNT_GRANT_REQUEST_TYPE = 'discountGrantApproval';

interface DiscountGrantPayloadShape {
    priceTypeCode: string;
    facetCode: string | null;
    facetValueCode: string | null;
    percent: number;
    validFrom: string;
    validTo: string;
    justification: string | null;
    counterpartyIds: string[] | null;
}

@Resolver()
export class DiscountRegistryResolver {
    constructor(
        private discountRegistryService: DiscountRegistryService,
        private connection: TransactionalConnection,
        private approvalRequestService: ApprovalRequestService,
    ) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    async discountRegistryPage(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: DiscountRegistryListOptions },
    ): Promise<PaginatedList<DiscountRegistryEntry>> {
        return this.discountRegistryService.findAllPaginated(ctx, args.options ?? {});
    }

    // One-off, idempotent backfill — see DiscountRegistryService.backfill's comment. Reconstructs
    // one registry entry per DiscountRule (status 'materialized' — portal-origin rules keep their
    // real approvalRequestId, ERP-pushed ones get none) and one per discountGrantApproval
    // ApprovalRequest still pending/rejected — approved requests are already covered by their
    // materialized DiscountRule, so they're skipped here to avoid a duplicate entry.
    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageApprovalWorkflows.Permission)
    async backfillDiscountRegistry(@Ctx() ctx: RequestContext): Promise<number> {
        const rules = await this.connection.getRepository(ctx, DiscountRule).find();

        // Fetched once, used both to recover justification/counterpartyIds for portal-origin
        // materialized rules below (DiscountRule itself doesn't store either — only the
        // originating request's payload does) and to build the pending/rejected entries further
        // down.
        const { items: requests } = await this.approvalRequestService.findByRequestType(
            ctx,
            DISCOUNT_GRANT_REQUEST_TYPE,
            { take: 10000 },
        );
        const requestById = new Map(requests.map(r => [String(r.id), r]));

        const ruleEntries = rules.map(rule => {
            const isPortalOrigin = rule.erpId.startsWith('portal-');
            const approvalRequestId = isPortalOrigin ? rule.erpId.slice('portal-'.length) : null;
            const sourceRequest = approvalRequestId
                ? requestById.get(approvalRequestId)
                : undefined;
            let payload: DiscountGrantPayloadShape | null = null;
            if (sourceRequest) {
                try {
                    payload = JSON.parse(sourceRequest.payload) as DiscountGrantPayloadShape;
                } catch {
                    payload = null;
                }
            }
            return {
                approvalRequestId,
                discountRuleId: rule.id,
                status: 'materialized' as const,
                input: {
                    priceTypeCode: rule.priceTypeCode,
                    facetCode: rule.facetCode,
                    facetValueCode: rule.facetValueCode,
                    percent: rule.percent,
                    validFrom: rule.validFrom,
                    validTo: rule.validTo,
                    justification: payload?.justification ?? null,
                    counterpartyIds: payload?.counterpartyIds ?? null,
                },
            };
        });

        const requestEntries = requests
            .filter(r => r.status === 'pending' || r.status === 'rejected')
            .map(request => {
                let payload: DiscountGrantPayloadShape | null = null;
                try {
                    payload = JSON.parse(request.payload) as DiscountGrantPayloadShape;
                } catch {
                    payload = null;
                }
                return {
                    approvalRequestId: request.id,
                    discountRuleId: null,
                    status: request.status as 'pending' | 'rejected',
                    input: {
                        priceTypeCode: payload?.priceTypeCode ?? '',
                        facetCode: payload?.facetCode ?? null,
                        facetValueCode: payload?.facetValueCode ?? null,
                        percent: payload?.percent ?? 0,
                        validFrom: payload?.validFrom
                            ? new Date(payload.validFrom)
                            : request.createdAt,
                        validTo: payload?.validTo ? new Date(payload.validTo) : request.createdAt,
                        justification: payload?.justification ?? null,
                        counterpartyIds: payload?.counterpartyIds ?? null,
                    },
                };
            });

        return this.discountRegistryService.backfill(ctx, [...ruleEntries, ...requestEntries]);
    }
}
