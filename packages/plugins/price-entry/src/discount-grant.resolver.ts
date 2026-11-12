import { Args, Query, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Allow,
    ConfigService,
    Ctx,
    PaginatedList,
    Permission,
    RequestContext,
    Transaction,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { CustomPermission, PriceTypeAccessService } from '@mivend/plugin-access-control';
import { ApprovalRequest, ApprovalStepDecision } from '@mivend/plugin-approval-workflow';

import { loadDiscountFacetOptions, type DiscountFacetOption } from './discount-facet-options';
import { activeGrantCounts } from './discount-grant-counts';
import { DiscountGrantService } from './discount-grant.service';
import {
    DiscountGrantInput,
    DiscountGrantForCustomer,
    DiscountGrantsForCounterpartyOptions,
} from './discount-grant.types';
import { DiscountGrant } from './discount-grant.entity';

const MAX_COUNT_IDS = 200;

@Resolver()
export class DiscountGrantResolver {
    constructor(
        private discountGrantService: DiscountGrantService,
        private priceTypeAccess: PriceTypeAccessService,
        private connection: TransactionalConnection,
        private configService: ConfigService,
    ) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    discountFacetOptions(@Ctx() ctx: RequestContext): Promise<DiscountFacetOption[]> {
        return loadDiscountFacetOptions(
            this.connection,
            ctx,
            this.configService.defaultLanguageCode,
        );
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async expiringDiscountGrants(
        @Ctx() ctx: RequestContext,
        @Args() args: { withinDays: number },
    ): Promise<DiscountGrant[]> {
        return this.discountGrantService.findExpiringSoon(
            ctx,
            args.withinDays,
            await this.priceTypeAccess.allowedCodes(ctx),
        );
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async discountGrantsForCounterparty(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: ID; options?: DiscountGrantsForCounterpartyOptions },
    ): Promise<PaginatedList<DiscountGrantForCustomer>> {
        return this.discountGrantService.findForCounterparty(ctx, args.counterpartyId, {
            ...args.options,
            allowedPriceTypeCodes: await this.priceTypeAccess.allowedCodes(ctx),
        });
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async activeDiscountCounts(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyIds: ID[] },
    ): Promise<Array<{ counterpartyId: string; count: number }>> {
        if (args.counterpartyIds.length > MAX_COUNT_IDS) {
            throw new UserInputError(`At most ${MAX_COUNT_IDS} counterparties per request`);
        }
        const counts = await activeGrantCounts(
            this.connection,
            ctx,
            args.counterpartyIds.map(String),
            await this.priceTypeAccess.allowedCodes(ctx),
        );
        return [...counts].map(([counterpartyId, count]) => ({ counterpartyId, count }));
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.RequestDiscountGrantApproval.Permission)
    async requestDiscountGrant(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: DiscountGrantInput },
    ): Promise<ApprovalRequest> {
        await this.priceTypeAccess.assertCodeAllowed(ctx, args.input.priceTypeCode);
        return this.discountGrantService.requestGrant(ctx, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ApproveDiscountRequest.Permission)
    async decideDiscountGrantRequest(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestId: ID; decision: ApprovalStepDecision; comment?: string },
    ): Promise<ApprovalRequest> {
        return this.discountGrantService.decideAndApply(
            ctx,
            args.requestId,
            args.decision,
            args.comment,
            await this.priceTypeAccess.allowedCodes(ctx),
        );
    }
}
