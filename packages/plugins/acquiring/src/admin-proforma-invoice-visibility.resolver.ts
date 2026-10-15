import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaInvoiceVisibilityService } from './proforma-invoice-visibility.service';
import { ProformaInvoiceListOptions } from './proforma-invoice.service';

// ProformaInvoiceListOptions/ProformaInvoiceList are hand-defined: no plugin-generated types exist.
// Shape must be kept in sync by hand with admin-order-visibility.resolver.ts scoping.
@Resolver()
export class AdminProformaInvoiceVisibilityResolver {
    constructor(private proformaInvoiceVisibilityService: ProformaInvoiceVisibilityService) {}

    @Query()
    @Allow(CustomPermission.ReadProformaInvoice.Permission)
    async visibleProformaInvoices(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ProformaInvoiceListOptions; counterpartyId?: string },
    ): Promise<PaginatedList<ProformaInvoice>> {
        return this.proformaInvoiceVisibilityService.findVisible(
            ctx,
            args.options,
            args.counterpartyId,
        );
    }

    @Query()
    @Allow(CustomPermission.ReadProformaInvoice.Permission)
    async proformaInvoiceOutstandingBalance(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: string },
    ): Promise<{ amount: number; currencyCode: string } | null> {
        return this.proformaInvoiceVisibilityService.getOutstandingBalance(
            ctx,
            args.counterpartyId,
        );
    }
}
