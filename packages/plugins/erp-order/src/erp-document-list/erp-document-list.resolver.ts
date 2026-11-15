import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import type { ErpDocumentListInput } from './erp-document-list-query';
import { ErpDocumentListService } from './erp-document-list.service';
import type { ErpDocumentCounts, ErpDocumentPage } from './erp-document-list.types';

// Same right as the order list; the counterparty visibility scope applies on top of it.
@Resolver()
export class ErpDocumentListResolver {
    constructor(private readonly service: ErpDocumentListService) {}

    @Query()
    @Allow(Permission.ReadOrder)
    visibleCustomerClaims(
        @Ctx() ctx: RequestContext,
        @Args() args: { list?: ErpDocumentListInput },
    ): Promise<ErpDocumentPage> {
        return this.service.findVisible(ctx, 'customerClaim', args.list);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    visibleSalesCorrections(
        @Ctx() ctx: RequestContext,
        @Args() args: { list?: ErpDocumentListInput },
    ): Promise<ErpDocumentPage> {
        return this.service.findVisible(ctx, 'salesCorrection', args.list);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    visibleOrderCorrections(
        @Ctx() ctx: RequestContext,
        @Args() args: { list?: ErpDocumentListInput },
    ): Promise<ErpDocumentPage> {
        return this.service.findVisible(ctx, 'orderCorrection', args.list);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    relatedErpDocumentCounts(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId?: string; counterpartyId?: string },
    ): Promise<ErpDocumentCounts> {
        return this.service.relatedCounts(ctx, args.orderId, args.counterpartyId);
    }
}
