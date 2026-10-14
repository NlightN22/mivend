import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, OrderLine, Permission, RequestContext } from '@vendure/core';

import {
    OrderReservationDetail,
    ReservationViewService,
    VariantReservationHolder,
} from './reservation-view.service';

@Resolver('OrderLine')
export class OrderLineReservationResolver {
    constructor(private view: ReservationViewService) {}

    @ResolveField()
    async reserved(@Ctx() ctx: RequestContext, @Parent() line: OrderLine): Promise<boolean> {
        return (await this.view.lineFlag(ctx, line.id)).reserved;
    }

    @ResolveField()
    async reservedUntil(
        @Ctx() ctx: RequestContext,
        @Parent() line: OrderLine,
    ): Promise<Date | null> {
        return (await this.view.lineFlag(ctx, line.id)).reservedUntil;
    }
}

@Resolver()
export class ReservationViewResolver {
    constructor(private view: ReservationViewService) {}

    @Query()
    @Allow(Permission.ReadOrder)
    orderReservationDetails(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<OrderReservationDetail[]> {
        return this.view.details(ctx, args.orderId);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    variantReservationHolders(
        @Ctx() ctx: RequestContext,
        @Args() args: { productVariantId: ID },
    ): Promise<VariantReservationHolder[]> {
        return this.view.holders(ctx, args.productVariantId);
    }
}
