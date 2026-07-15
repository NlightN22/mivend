import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    EventBus,
    Order,
    RequestContext,
    StockLevel,
    StockLocation,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { Reservation } from './entities/reservation.entity';
import { ReservationConfirmedEvent, ReservationReleasedEvent } from './reservation.events';
import {
    InsufficientStockError,
    InsufficientStockLine,
    InvalidMultiplicityError,
    InvalidMultiplicityLine,
    OrderNotEligibleError,
} from './reservation-errors';
import { OrderReservationState, ReservationCreationMethod } from './types';

@Injectable()
export class ReservationService {
    private cachedStockLocationId: string | undefined;

    constructor(
        private connection: TransactionalConnection,
        private eventBus: EventBus,
    ) {}

    // Thin wrapper over reserveOrder() for the manual-confirm mutation (see docs/order-flow.md
    // "Single reservation service, two triggers"), gated on the ConfirmOrder permission.
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

    // The single transactional stock-check + reservation-write path for every trigger (manual
    // confirm, auto-prepaid). Concurrency-safe: locks the order's StockLevel rows FOR UPDATE
    // before computing ATP, so two concurrent reservations against the same variant+location
    // serialize on that lock rather than both reading stale free stock. Idempotent: a second
    // call for an order that already has an active reservation set is a no-op that returns the
    // existing rows. Full-order-only: if any line is short (or violates multiplicity), nothing
    // is written and the caller gets every offending line back in one error (see
    // docs/order-flow.md "Full-order-only reservation").
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
            return await this.connection.withTransaction(ctx, async txCtx => {
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

                // Defense in depth alongside the moq plugin's OrderInterceptor — see
                // docs/order-flow.md "Pack-size / MOQ". null/0/negative multiplicity is a data
                // error, treated as "no constraint" (same as 1), not a rejection.
                const multiplicityViolations: InvalidMultiplicityLine[] = [];
                for (const line of order.lines) {
                    const multiplicity = line.productVariant?.customFields?.multiplicity ?? 1;
                    const effective = multiplicity > 1 ? multiplicity : 1;
                    if (line.quantity % effective !== 0) {
                        multiplicityViolations.push({
                            orderLineId: String(line.id),
                            productVariantId: String(line.productVariantId),
                            quantity: line.quantity,
                            multiplicity: effective,
                        });
                    }
                }
                if (multiplicityViolations.length > 0) {
                    throw new InvalidMultiplicityError(multiplicityViolations);
                }

                const stockLocationId = await this.getDefaultStockLocationId(txCtx);
                const stockLevelRepo = this.connection.getRepository(txCtx, StockLevel);

                const shortfalls: InsufficientStockLine[] = [];
                const now = new Date();
                const expiresAt = new Date(now.getTime() + reservationDays * 24 * 60 * 60 * 1000);
                const rows: Reservation[] = [];

                for (const line of order.lines) {
                    const stockLevel = await stockLevelRepo
                        .createQueryBuilder('stockLevel')
                        .setLock('pessimistic_write')
                        .where('stockLevel.productVariantId = :variantId', {
                            variantId: line.productVariantId,
                        })
                        .andWhere('stockLevel.stockLocationId = :stockLocationId', {
                            stockLocationId,
                        })
                        .getOne();

                    const stockOnHand = stockLevel?.stockOnHand ?? 0;
                    const stockAllocated = stockLevel?.stockAllocated ?? 0;
                    const activeReserved = await this.sumActiveReservations(
                        txCtx,
                        line.productVariantId,
                        stockLocationId,
                    );
                    const available = stockOnHand - stockAllocated - activeReserved;

                    if (available < line.quantity) {
                        shortfalls.push({
                            orderLineId: String(line.id),
                            productVariantId: String(line.productVariantId),
                            required: line.quantity,
                            available,
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
                            branchId: order.customFields.branchId ?? null,
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
                return saved;
            });
        } catch (error) {
            if (
                error instanceof InsufficientStockError ||
                error instanceof InvalidMultiplicityError
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
        order.customFields = { ...order.customFields, reservationState: state };
        await this.connection.getRepository(ctx, Order).save(order);
    }

    private async sumActiveReservations(
        ctx: RequestContext,
        productVariantId: ID,
        stockLocationId: string,
    ): Promise<number> {
        const rows = await this.connection.getRepository(ctx, Reservation).find({
            where: {
                productVariantId: String(productVariantId),
                stockLocationId,
                status: 'active',
            },
        });
        return rows.reduce((sum, r) => sum + r.quantity, 0);
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

    private async getDefaultStockLocationId(ctx: RequestContext): Promise<string> {
        if (this.cachedStockLocationId) {
            return this.cachedStockLocationId;
        }
        const location = await this.connection
            .getRepository(ctx, StockLocation)
            .createQueryBuilder()
            .getOne();
        if (!location) {
            throw new UserInputError('No stock location configured');
        }
        this.cachedStockLocationId = String(location.id);
        return this.cachedStockLocationId;
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
