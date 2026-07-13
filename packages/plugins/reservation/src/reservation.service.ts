import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    AdministratorService,
    ForbiddenError,
    Order,
    RequestContext,
    StockLevel,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { DataSource } from 'typeorm';

import { Reservation } from './entities/reservation.entity';
import { ReservationExtensionLimitService } from './reservation-extension-limit.service';

@Injectable()
export class ReservationService {
    constructor(
        private connection: TransactionalConnection,
        private dataSource: DataSource,
        private administratorService: AdministratorService,
        private extensionLimitService: ReservationExtensionLimitService,
    ) {}

    // Creates one Reservation per order line, reserving each line's current quantity for
    // `reservationDays` from now. Rejects a second confirm while an active reservation already
    // exists — release (or let it expire) first.
    async confirmOrder(
        ctx: RequestContext,
        orderId: ID,
        reservationDays: number,
    ): Promise<Reservation[]> {
        if (!Number.isInteger(reservationDays) || reservationDays <= 0) {
            throw new UserInputError('reservationDays must be a positive integer');
        }

        const repo = this.connection.getRepository(ctx, Reservation);
        const existingActive = await repo.count({
            where: { orderId: String(orderId), status: 'active' },
        });
        if (existingActive > 0) {
            throw new UserInputError('This order already has an active reservation');
        }

        const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId },
            relations: ['lines'],
        });
        if (!order) {
            throw new UserInputError('Order not found');
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + reservationDays * 24 * 60 * 60 * 1000);
        const rows = order.lines.map(line =>
            repo.create({
                orderId: String(order.id),
                orderLineId: String(line.id),
                productVariantId: String(line.productVariantId),
                quantity: line.quantity,
                status: 'active' as const,
                reservedAt: now,
                expiresAt,
                releasedAt: null,
            }),
        );
        return repo.save(rows);
    }

    async releaseReservations(ctx: RequestContext, orderId: ID): Promise<number> {
        const repo = this.connection.getRepository(ctx, Reservation);
        const result = await repo.update(
            { orderId: String(orderId), status: 'active' },
            { status: 'released', releasedAt: new Date() },
        );
        return result.affected ?? 0;
    }

    async findForOrder(ctx: RequestContext, orderId: ID): Promise<Reservation[]> {
        return this.connection
            .getRepository(ctx, Reservation)
            .find({ where: { orderId: String(orderId) }, order: { reservedAt: 'DESC' } });
    }

    async getReservedQuantity(ctx: RequestContext, productVariantId: ID): Promise<number> {
        const rows = await this.connection
            .getRepository(ctx, Reservation)
            .find({ where: { productVariantId: String(productVariantId), status: 'active' } });
        return rows.reduce((sum, r) => sum + r.quantity, 0);
    }

    // Soft reservation never touches stockOnHand itself (see Reservation entity doc comment) —
    // "available to sell" is always computed as stockOnHand minus the sum of active reservations.
    // stockOnHand lives on StockLevel (summed across locations), not a column on ProductVariant
    // itself — same table erp-import's stock.handler.ts writes to.
    async getAvailableQuantity(ctx: RequestContext, productVariantId: ID): Promise<number> {
        const stockLevels = await this.connection
            .getRepository(ctx, StockLevel)
            .find({ where: { productVariantId } });
        const stockOnHand = stockLevels.reduce((sum, level) => sum + level.stockOnHand, 0);
        const reserved = await this.getReservedQuantity(ctx, productVariantId);
        return stockOnHand - reserved;
    }

    // "managers can extend up to a configured maximum without additional approval" (see
    // docs/architecture.md) — the caller's role must have a ReservationExtensionLimit row, and
    // additionalDays must not exceed it. No row configured means no self-service extension is
    // allowed for that role (safe default, mirrors CreditTermLimitService's absence-is-strict
    // convention).
    async extendReservation(
        ctx: RequestContext,
        orderId: ID,
        additionalDays: number,
    ): Promise<Reservation[]> {
        if (!Number.isInteger(additionalDays) || additionalDays <= 0) {
            throw new UserInputError('additionalDays must be a positive integer');
        }

        const roleCode = await this.getCallerRoleCode(ctx);
        const limit = roleCode ? await this.extensionLimitService.getLimit(ctx, roleCode) : null;
        if (!limit || additionalDays > limit.maxExtraDays) {
            throw new ForbiddenError();
        }

        const repo = this.connection.getRepository(ctx, Reservation);
        const active = await repo.find({ where: { orderId: String(orderId), status: 'active' } });
        if (!active.length) {
            throw new UserInputError('This order has no active reservation to extend');
        }

        for (const row of active) {
            row.expiresAt = new Date(
                row.expiresAt.getTime() + additionalDays * 24 * 60 * 60 * 1000,
            );
        }
        return repo.save(active);
    }

    private async getCallerRoleCode(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId, [
            'user.roles',
        ]);
        return admin?.user?.roles?.[0]?.code ?? null;
    }

    // Called by ReservationExpiryWorker on a timer — runs outside any HTTP request, so it uses
    // the raw DataSource directly rather than TransactionalConnection (same pattern as
    // SyncService.processOutbox — see packages/plugins/sync/src/sync.service.ts).
    async expireDueReservations(): Promise<number> {
        const result = await this.dataSource
            .getRepository(Reservation)
            .createQueryBuilder()
            .update(Reservation)
            .set({ status: 'expired' })
            .where('status = :status', { status: 'active' })
            .andWhere('"expiresAt" <= :now', { now: new Date() })
            .execute();
        return result.affected ?? 0;
    }
}
