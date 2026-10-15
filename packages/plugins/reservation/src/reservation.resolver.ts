import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Allow,
    Ctx,
    Order,
    PaginatedList,
    Permission,
    RequestContext,
    Transaction,
    TransactionalConnection,
} from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ReservationExtensionLimit } from './entities/reservation-extension-limit.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationReconciliationIssue } from './entities/reservation-reconciliation-issue.entity';
import { OrderContractOption, OrderContractService } from './order-contract.service';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { ReservationExtensionLimitService } from './reservation-extension-limit.service';
import { ReservationFailureService } from './reservation-failure.service';
import { ReservationExtensionService } from './reservation-extension.service';
import {
    OpenReservationReconciliationIssueListOptions,
    ReservationReconciliationIssueService,
} from './reservation-reconciliation-issue.service';
import { ReservationService } from './reservation.service';

@Resolver()
export class ReservationResolver {
    constructor(
        private connection: TransactionalConnection,
        private reservationService: ReservationService,
        private availabilityService: ReservationAvailabilityService,
        private extensionService: ReservationExtensionService,
        private extensionLimitService: ReservationExtensionLimitService,
        private reconciliationIssueService: ReservationReconciliationIssueService,
        private orderContractService: OrderContractService,
        private failureService: ReservationFailureService,
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
    @Allow(Permission.ReadOrder)
    async orderContracts(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<OrderContractOption[]> {
        return this.orderContractService.list(ctx, args.orderId);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async availableStock(
        @Ctx() ctx: RequestContext,
        @Args() args: { productVariantId: ID; orderId?: ID },
    ): Promise<number> {
        if (args.orderId == null) {
            return this.availabilityService.getAvailableToPromise(ctx, args.productVariantId);
        }
        const order = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { id: args.orderId } });
        const reservable = await this.availabilityService.getReservableBatch(
            ctx,
            [args.productVariantId],
            order?.customFields.branchId ?? null,
        );
        return reservable.get(String(args.productVariantId)) ?? 0;
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

    // Confirm and release share one permission: one staff action from the operator's view.
    // Extend stays under UpdateOrder; the permissions doc scopes ConfirmOrder to confirm+release only.
    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ConfirmOrder.Permission)
    async confirmOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; reservationDays: number },
    ): Promise<Reservation[]> {
        try {
            return await this.reservationService.confirmOrder(
                ctx,
                args.orderId,
                args.reservationDays,
            );
        } catch (error) {
            throw await this.failureService.toStaffError(ctx, error);
        }
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
    @Allow(CustomPermission.ConfirmOrder.Permission)
    async setOrderContract(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; contractId: string },
    ): Promise<OrderContractOption[]> {
        return this.orderContractService.set(ctx, args.orderId, args.contractId);
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
