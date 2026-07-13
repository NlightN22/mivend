import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ReservationExtensionLimit } from './entities/reservation-extension-limit.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationExtensionLimitService } from './reservation-extension-limit.service';
import { ReservationService } from './reservation.service';

@Resolver()
export class ReservationResolver {
    constructor(
        private reservationService: ReservationService,
        private extensionLimitService: ReservationExtensionLimitService,
    ) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async orderReservations(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<Reservation[]> {
        return this.reservationService.findForOrder(ctx, args.orderId);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async availableStock(
        @Ctx() ctx: RequestContext,
        @Args() args: { productVariantId: ID },
    ): Promise<number> {
        return this.reservationService.getAvailableQuantity(ctx, args.productVariantId);
    }

    @Query()
    @Allow(Permission.Authenticated)
    async reservationExtensionLimit(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleCode: string },
    ): Promise<ReservationExtensionLimit | null> {
        return this.extensionLimitService.getLimit(ctx, args.roleCode);
    }

    // Gated on UpdateOrder — same permission that already lets a role edit order lines
    // (operator/manager, see infrastructure/scripts/seed-access-roles.mjs), not a new
    // dedicated permission — confirming/releasing a reservation is part of order handling,
    // not a separate approval-gated capability.
    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async confirmOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; reservationDays: number },
    ): Promise<Reservation[]> {
        return this.reservationService.confirmOrder(ctx, args.orderId, args.reservationDays);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async releaseOrderReservation(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<number> {
        return this.reservationService.releaseReservations(ctx, args.orderId);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async extendOrderReservation(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; additionalDays: number },
    ): Promise<Reservation[]> {
        return this.reservationService.extendReservation(ctx, args.orderId, args.additionalDays);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async setReservationExtensionLimit(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleCode: string; maxExtraDays: number },
    ): Promise<ReservationExtensionLimit> {
        return this.extensionLimitService.setLimit(ctx, args.roleCode, args.maxExtraDays);
    }
}
