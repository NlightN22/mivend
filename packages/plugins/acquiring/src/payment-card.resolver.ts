import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { CardOrder, CardProforma, CardRefund, PaymentCardLoader } from './payment-card.loader';
import { PaymentVisibilityService, VisiblePaymentCard } from './payment-visibility.service';

// Admin-only: the type exists in the Admin schema alone, so the Shop API never serves these fields.
@Resolver('PaymentCard')
export class PaymentCardFieldResolver {
    constructor(private loader: PaymentCardLoader) {}

    @ResolveField()
    id(@Parent() card: VisiblePaymentCard): string {
        return String(card.payment.id);
    }

    @ResolveField()
    number(@Parent() card: VisiblePaymentCard): string {
        return card.payment.number;
    }

    @ResolveField()
    createdAt(@Parent() card: VisiblePaymentCard): Date {
        return card.payment.createdAt;
    }

    @ResolveField()
    channel(@Parent() card: VisiblePaymentCard): string {
        return card.payment.channel;
    }

    @ResolveField()
    paymentStatus(@Parent() card: VisiblePaymentCard): string {
        return card.payment.paymentStatus;
    }

    @ResolveField()
    amount(@Parent() card: VisiblePaymentCard): number {
        return card.payment.amount;
    }

    @ResolveField()
    currencyCode(@Parent() card: VisiblePaymentCard): string {
        return card.payment.currencyCode;
    }

    @ResolveField()
    providerPaymentId(@Parent() card: VisiblePaymentCard): string {
        return card.payment.providerPaymentId;
    }

    @ResolveField()
    customer(@Parent() card: VisiblePaymentCard): {
        id: string;
        shortName: string | null;
        inn: string | null;
    } {
        return {
            id: card.counterpartyId,
            shortName: card.counterpartyShortName,
            inn: card.counterpartyInn,
        };
    }

    @ResolveField()
    proformaInvoice(
        @Ctx() ctx: RequestContext,
        @Parent() card: VisiblePaymentCard,
    ): Promise<CardProforma | null> | null {
        const id = card.payment.proformaInvoiceId;
        return id == null ? null : this.loader.proforma(ctx, String(id));
    }

    @ResolveField()
    order(
        @Ctx() ctx: RequestContext,
        @Parent() card: VisiblePaymentCard,
    ): Promise<CardOrder | null> | null {
        return card.orderId == null
            ? null
            : this.loader.order(ctx, card.orderId, card.counterpartyId);
    }

    @ResolveField()
    refunds(@Ctx() ctx: RequestContext, @Parent() card: VisiblePaymentCard): Promise<CardRefund[]> {
        return this.loader.refundsOf(ctx, String(card.payment.id));
    }
}

@Resolver()
export class AdminPaymentCardResolver {
    constructor(private paymentVisibilityService: PaymentVisibilityService) {}

    @Query()
    @Allow(CustomPermission.ReadPayment.Permission)
    payment(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<VisiblePaymentCard | null> {
        return this.paymentVisibilityService.findVisibleOne(ctx, String(args.id));
    }
}
