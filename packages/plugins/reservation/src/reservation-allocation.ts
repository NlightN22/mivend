import { randomUUID } from 'crypto';
import { ID } from '@vendure/common/lib/shared-types';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import { Reservation } from './entities/reservation.entity';
import { InsufficientStockLine } from './reservation-errors';
import { pickLocationWithMostFreeStock } from './reservation-location-picker';
import { ReservationCreationMethod } from './types';

export interface AllocationParams {
    branchId: string | null;
    reservationDays: number;
    trigger: ReservationCreationMethod;
    administratorId?: ID;
}

async function nextGeneration(
    connection: TransactionalConnection,
    ctx: RequestContext,
    orderLineId: string,
    stockLocationId: string,
): Promise<number> {
    const result = await connection
        .getRepository(ctx, Reservation)
        .createQueryBuilder('r')
        .select('MAX(r.reservationGeneration)', 'max')
        .where('r.orderLineId = :orderLineId', { orderLineId })
        .andWhere('r.stockLocationId = :stockLocationId', { stockLocationId })
        .getRawOne<{ max: number | null }>();
    return (result?.max ?? 0) + 1;
}

// Picks a location per line (locking stock); lines without enough stock become shortfalls.
export async function allocateReservationRows(
    connection: TransactionalConnection,
    txCtx: RequestContext,
    order: Order,
    candidateLocationIds: string[],
    params: AllocationParams,
): Promise<{ rows: Reservation[]; shortfalls: InsufficientStockLine[] }> {
    const reservationRepo = connection.getRepository(txCtx, Reservation);
    const shortfalls: InsufficientStockLine[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + params.reservationDays * 24 * 60 * 60 * 1000);
    const rows: Reservation[] = [];
    const heldByVariant = new Map<string, Map<string, number>>();

    for (const line of order.lines) {
        const held = heldByVariant.get(String(line.productVariantId)) ?? new Map();
        const { stockLocationId, available: bestAvailable } = await pickLocationWithMostFreeStock(
            connection,
            txCtx,
            line.productVariantId,
            candidateLocationIds,
            { lock: true, held },
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

        const generation = await nextGeneration(
            connection,
            txCtx,
            String(line.id),
            stockLocationId,
        );
        held.set(stockLocationId, (held.get(stockLocationId) ?? 0) + line.quantity);
        heldByVariant.set(String(line.productVariantId), held);
        rows.push(
            reservationRepo.create({
                orderId: String(order.id),
                orderLineId: String(line.id),
                productVariantId: String(line.productVariantId),
                stockLocationId,
                branchId: params.branchId,
                quantity: line.quantity,
                status: 'active' as const,
                reservedAt: now,
                expiresAt,
                releasedAt: null,
                reservationGeneration: generation,
                creationMethod: params.trigger,
                confirmedByAdministratorId: params.administratorId
                    ? String(params.administratorId)
                    : null,
                erpOperationId: randomUUID(),
                erpConfirmedAt: null,
            }),
        );
    }
    return { rows, shortfalls };
}
