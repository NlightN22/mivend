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
import { ApprovalRequestQueryService } from '@mivend/plugin-approval-workflow';
import { CustomPermission, PriceTypeAccessService } from '@mivend/plugin-access-control';

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
        private approvalRequestQueryService: ApprovalRequestQueryService,
        private priceTypeAccess: PriceTypeAccessService,
    ) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    async discountRegistryPage(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: DiscountRegistryListOptions },
    ): Promise<PaginatedList<DiscountRegistryEntry>> {
        const { priceTypeCode, ...rest } = args.options ?? {};
        if (priceTypeCode) await this.priceTypeAccess.assertCodeAllowed(ctx, priceTypeCode);
        return this.discountRegistryService.findAllPaginated(ctx, {
            ...rest,
            priceTypeCode,
            allowedPriceTypeCodes: await this.priceTypeAccess.allowedCodes(ctx),
        });
    }

    // Idempotent: re-running is safe.
    // Approved requests are skipped because their materialized DiscountRule already has an entry.
    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageApprovalWorkflows.Permission)
    async backfillDiscountRegistry(@Ctx() ctx: RequestContext): Promise<number> {
        // Excluded: rules with no priceTypeCode (counterparty/contract-scoped) or a nullable validTo.
        // This registry is priceType-scoped only, matching findByPriceType.
        const rules = (await this.connection.getRepository(ctx, DiscountRule).find()).filter(
            rule => rule.recipientType === null,
        );

        // DiscountRule does not store justification or counterpartyIds; only the originating request payload does.
        // Fetch once and reuse it for the pending/rejected entries below.
        const { items: requests } = await this.approvalRequestQueryService.findByRequestType(
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
                    // Promo rules have a null priceTypeCode; fall back to '' because the registry column is non-null.
                    priceTypeCode: rule.priceTypeCode ?? '',
                    facetCode: rule.facetCode,
                    facetValueCode: rule.facetValueCode,
                    percent: rule.percent,
                    validFrom: rule.validFrom,
                    validTo: rule.validTo as Date, // recipientType rows already filtered above
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
