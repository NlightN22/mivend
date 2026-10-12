import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { Invoice } from './entities/invoice.entity';
import { InvoiceVisibilityService } from './invoice-visibility.service';
import { InvoiceListOptions } from './invoice.service';

// Scoped equivalent of a plain "list all invoices" query for the manager portal — mirrors
// packages/plugins/erp-order/src/admin-order-visibility.resolver.ts. Invoice is a plugin-owned
// entity (no Vendure-generated InvoiceListOptions to reuse), so InvoiceListOptions/InvoiceList
// are hand-defined in api/admin.schema.ts, same as the Shop API's myInvoices.
@Resolver()
export class AdminInvoiceVisibilityResolver {
    constructor(private invoiceVisibilityService: InvoiceVisibilityService) {}

    @Query()
    @Allow(CustomPermission.ReadInvoice.Permission)
    async visibleInvoices(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: InvoiceListOptions; counterpartyId?: string },
    ): Promise<PaginatedList<Invoice>> {
        return this.invoiceVisibilityService.findVisible(ctx, args.options, args.counterpartyId);
    }

    @Query()
    @Allow(CustomPermission.ReadInvoice.Permission)
    async invoiceOutstandingBalance(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: string },
    ): Promise<{ amount: number; currencyCode: string } | null> {
        return this.invoiceVisibilityService.getOutstandingBalance(ctx, args.counterpartyId);
    }
}
