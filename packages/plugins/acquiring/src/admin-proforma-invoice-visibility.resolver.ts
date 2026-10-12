import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaInvoiceVisibilityService } from './proforma-invoice-visibility.service';
import { ProformaInvoiceListOptions } from './proforma-invoice.service';

// Scoped equivalent of a plain "list all proforma invoices" query for the manager portal — mirrors
// packages/plugins/erp-order/src/admin-order-visibility.resolver.ts. ProformaInvoice is a plugin-owned
// entity (no Vendure-generated ProformaInvoiceListOptions to reuse), so ProformaInvoiceListOptions/ProformaInvoiceList
// are hand-defined in api/admin.schema.ts, same as the Shop API's myProformaInvoices.
@Resolver()
export class AdminProformaInvoiceVisibilityResolver {
    constructor(private proformaInvoiceVisibilityService: ProformaInvoiceVisibilityService) {}

    @Query()
    @Allow(CustomPermission.ReadInvoice.Permission)
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
    @Allow(CustomPermission.ReadInvoice.Permission)
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
