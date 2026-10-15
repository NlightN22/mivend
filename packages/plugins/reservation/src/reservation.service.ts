import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    EventBus,
    Order,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';
import { PackagingPolicyService } from '@mivend/plugin-moq';

import { pickLocationWithMostFreeStock } from './reservation-location-picker';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { Reservation } from './entities/reservation.entity';
import {
    OrderReservedEvent,
    ReservationConfirmedEvent,
    ReservationReleasedEvent,
} from './reservation.events';
import {
    ErpExportDataMissingError,
    InsufficientStockError,
    InsufficientStockLine,
    InvalidMultiplicityError,
    OrderNotEligibleError,
} from './reservation-errors';
import { OrderReservationState, ReservationCreationMethod } from './types';
import { withAggregateLock } from 'shared';
import { findErpExportGaps, findMultiplicityViolations } from './reservation-preflight';
import { writeOrderReservationState } from './reservation-order-state';

@Injectable()
export class ReservationService {
    constructor(
        private connection: TransactionalConnection,
        private eventBus: EventBus,
        private availabilityService: ReservationAvailabilityService,
        private counterpartyService: CounterpartyService,
        private contractService: ContractService,
        private packagingPolicyService: PackagingPolicyService,
    ) {}

    async confirmOrder(
        ctx: RequestContext,
        orderId: ID,
        reservationDays: number,
    ): Promise<Reservation[]> {
        return this.reserveOrder(
            ctx,
            orderId,
            reservationDays,
            'manual',
            ctx.activeUserId ?? undefined,
        );
    }

    // Single transactional stock-check + write path for every trigger; idempotent per order and
    // full-order-only (docs/order-flow.md "Full-order-only reservation").
    async reserveOrder(
        ctx: RequestContext,
        orderId: ID,
        reservationDays: number,
        trigger: ReservationCreationMethod,
        administratorId?: ID,
    ): Promise<Reservation[]> {
        if (!Number.isInteger(reservationDays) || reservationDays <= 0) {
            throw new UserInputError('reservationDays must be a positive integer');
        }

        try {
            return await withAggregateLock(
                this.connection,
                ctx,
                `reserve-order:${orderId}`,
                async txCtx => {
                    const reservationRepo = this.connection.getRepository(txCtx, Reservation);

                    const existingActive = await reservationRepo.find({
                        where: { orderId: String(orderId), status: 'active' },
                    });
                    if (existingActive.length > 0) {
                        return existingActive;
                    }

                    const order = await this.connection.getRepository(txCtx, Order).findOne({
                        where: { id: orderId },
                        relations: ['lines', 'lines.productVariant'],
                    });
                    if (!order) {
                        throw new OrderNotEligibleError('Order not found');
                    }
                    if (order.customFields?.isExternal === true) {
                        throw new OrderNotEligibleError('Orders from the ERP are managed there');
                    }
                    if (order.lines.length === 0) {
                        throw new OrderNotEligibleError('Order has no lines');
                    }
                    if (order.state === 'Cancelled') {
                        throw new OrderNotEligibleError('Order is cancelled');
                    }

                    // Defense in depth: same step as the moq OrderInterceptor (docs/order-flow.md).
                    const multiplicityViolations = await findMultiplicityViolations(
                        this.packagingPolicyService,
                        txCtx,
                        order,
                    );
                    if (multiplicityViolations.length > 0) {
                        throw new InvalidMultiplicityError(multiplicityViolations);
                    }

                    const branchId = order.customFields.branchId ?? null;
                    const candidateLocationIds = branchId
                        ? await this.availabilityService.findBranchStockLocationIds(txCtx, branchId)
                        : [];
                    const gaps = await findErpExportGaps(
                        {
                            connection: this.connection,
                            counterpartyService: this.counterpartyService,
                            contractService: this.contractService,
                        },
                        txCtx,
                        order,
                        candidateLocationIds,
                    );
                    if (gaps.missingCustomerId || gaps.missingContract || gaps.lines.length > 0) {
                        throw new ErpExportDataMissingError(
                            gaps.missingCustomerId,
                            gaps.lines,
                            gaps.missingContract,
                        );
                    }

                    const shortfalls: InsufficientStockLine[] = [];
                    const now = new Date();
                    const expiresAt = new Date(
                        now.getTime() + reservationDays * 24 * 60 * 60 * 1000,
                    );
                    const rows: Reservation[] = [];

                    for (const line of order.lines) {
                        const { stockLocationId, available: bestAvailable } =
                            await pickLocationWithMostFreeStock(
                                this.connection,
                                txCtx,
                                line.productVariantId,
                                candidateLocationIds,
                            );

                        if (bestAvailable < line.quantity) {
                            shortfalls.push({
                                orderLineId: String(line.id),
                                productVariantId: String(line.productVariantId),
                                required: line.quantity,
                                available: bestAvailable,
                            });
                            continue;
                        }

                        const generation = await this.nextGeneration(
                            txCtx,
                            String(line.id),
                            stockLocationId,
                        );
                        rows.push(
                            reservationRepo.create({
                                orderId: String(order.id),
                                orderLineId: String(line.id),
                                productVariantId: String(line.productVariantId),
                                stockLocationId,
                                branchId,
                                quantity: line.quantity,
                                status: 'active' as const,
                                reservedAt: now,
                                expiresAt,
                                releasedAt: null,
                                reservationGeneration: generation,
                                creationMethod: trigger,
                                confirmedByAdministratorId: administratorId
                                    ? String(administratorId)
                                    : null,
                                erpOperationId: randomUUID(),
                                erpConfirmedAt: null,
                            }),
                        );
                    }

                    if (shortfalls.length > 0) {
                        throw new InsufficientStockError(shortfalls);
                    }

                    const saved = await reservationRepo.save(rows);
                    await this.setOrderReservationState(txCtx, order, 'RESERVED');
                    for (const reservation of saved) {
                        this.eventBus.publish(
                            new ReservationConfirmedEvent(txCtx, reservation, order.code),
                        );
                    }
                    this.eventBus.publish(new OrderReservedEvent(txCtx, order.id, order.code));
                    return saved;
                },
            );
        } catch (error) {
            if (
                error instanceof InsufficientStockError ||
                error instanceof InvalidMultiplicityError ||
                error instanceof ErpExportDataMissingError
            ) {
                await this.markReservationFailed(ctx, orderId);
            }
            throw error;
        }
    }

    async releaseReservations(ctx: RequestContext, orderId: ID): Promise<number> {
        const repo = this.connection.getRepository(ctx, Reservation);
        const active = await repo.find({ where: { orderId: String(orderId), status: 'active' } });
        if (active.length === 0) {
            return 0;
        }

        const releasedAt = new Date();
        for (const reservation of active) {
            reservation.status = 'released';
            reservation.releasedAt = releasedAt;
            reservation.erpReleaseOperationId = randomUUID();
        }
        await repo.save(active);

        const order = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { id: orderId } });
        for (const reservation of active) {
            this.eventBus.publish(
                new ReservationReleasedEvent(ctx, reservation, order?.code ?? String(orderId)),
            );
        }
        if (order) {
            await this.setOrderReservationState(ctx, order, 'RELEASED');
        }
        return active.length;
    }

    async findForOrder(ctx: RequestContext, orderId: ID): Promise<Reservation[]> {
        return this.connection
            .getRepository(ctx, Reservation)
            .find({ where: { orderId: String(orderId) }, order: { reservedAt: 'DESC' } });
    }

    async setOrderReservationState(
        ctx: RequestContext,
        order: Order,
        state: OrderReservationState,
    ): Promise<void> {
        await writeOrderReservationState(this.connection, ctx, order, state);
    }

    private async nextGeneration(
        ctx: RequestContext,
        orderLineId: string,
        stockLocationId: string,
    ): Promise<number> {
        const result = await this.connection
            .getRepository(ctx, Reservation)
            .createQueryBuilder('r')
            .select('MAX(r.reservationGeneration)', 'max')
            .where('r.orderLineId = :orderLineId', { orderLineId })
            .andWhere('r.stockLocationId = :stockLocationId', { stockLocationId })
            .getRawOne<{ max: number | null }>();
        return (result?.max ?? 0) + 1;
    }

    private async markReservationFailed(ctx: RequestContext, orderId: ID): Promise<void> {
        const order = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { id: orderId } });
        if (!order) {
            return;
        }
        await this.setOrderReservationState(ctx, order, 'FAILED');
    }
}
