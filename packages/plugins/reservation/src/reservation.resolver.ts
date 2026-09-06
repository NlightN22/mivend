import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, PaginatedList, Permission, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ReservationExtensionLimit } from './entities/reservation-extension-limit.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationReconciliationIssue } from './entities/reservation-reconciliation-issue.entity';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { ReservationExtensionLimitService } from './reservation-extension-limit.service';
import { ReservationExtensionService } from './reservation-extension.service';
import {
    OpenReservationReconciliationIssueListOptions,
    ReservationReconciliationIssueService,
} from './reservation-reconciliation-issue.service';
import { ReservationService } from './reservation.service';

@Resolver()
export class ReservationResolver {
    constructor(
        private reservationService: ReservationService,
        private availabilityService: ReservationAvailabilityService,
        private extensionService: ReservationExtensionService,
        private extensionLimitService: ReservationExtensionLimitService,
        private reconciliationIssueService: ReservationReconciliationIssueService,
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
        return this.availabilityService.getAvailableToPromise(ctx, args.productVariantId);
    }

    @Query()
    @Allow(Permission.Authenticated)
    async reservationExtensionLimit(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleCode: string },
    ): Promise<ReservationExtensionLimit | null> {
        return this.extensionLimitService.getLimit(ctx, args.roleCode);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    async openReservationReconciliationIssues(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OpenReservationReconciliationIssueListOptions },
    ): Promise<PaginatedList<ReservationReconciliationIssue>> {
        return this.reconciliationIssueService.findOpen(ctx, args.options);
    }

    // ConfirmOrder covers both confirm and release — one staff action from the operator's
    // perspective (see docs/order-flow.md "Permissions"). Extend stays on UpdateOrder — the
    // doc only scopes ConfirmOrder to "confirm + release".
    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ConfirmOrder.Permission)
    async confirmOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; reservationDays: number },
    ): Promise<Reservation[]> {
        return this.reservationService.confirmOrder(ctx, args.orderId, args.reservationDays);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ConfirmOrder.Permission)
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
        return this.extensionService.extendReservation(ctx, args.orderId, args.additionalDays);
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
