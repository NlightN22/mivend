import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { PaymentAttempt } from './entities/payment-attempt.entity';
import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaInvoiceDetailService } from './proforma-invoice-detail.service';

// Admin API only: the shared ProformaInvoiceFieldResolver is also registered for the shop schema.
@Resolver('ProformaInvoice')
export class ProformaInvoiceDetailFieldResolver {
    constructor(private detail: ProformaInvoiceDetailService) {}

    // Payments need ReadPayment like the payment queries; without it the card still loads, with none.
    @ResolveField()
    async payments(
        @Ctx() ctx: RequestContext,
        @Parent() proformaInvoice: ProformaInvoice,
    ): Promise<PaymentAttempt[]> {
        if (!ctx.userHasPermissions([CustomPermission.ReadPayment.Permission])) return [];
        return this.detail.payments(ctx, Number(proformaInvoice.id));
    }

    @ResolveField()
    versions(
        @Ctx() ctx: RequestContext,
        @Parent() proformaInvoice: ProformaInvoice,
    ): Promise<ProformaInvoice[]> {
        return this.detail.versions(ctx, proformaInvoice);
    }
}
