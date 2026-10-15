import { Injectable } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { Reservation } from './entities/reservation.entity';
import { pickOrderWarehouse } from './order-check-subject';
import type { OrderCheckSubject } from './order-check-subject';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { pickLocationWithMostFreeStock } from './reservation-location-picker';

@Injectable()
export class OrderCheckSubjectLoader {
    constructor(
        private connection: TransactionalConnection,
        private counterpartyService: CounterpartyService,
        private availabilityService: ReservationAvailabilityService,
    ) {}

    async load(ctx: RequestContext, orderId: string): Promise<OrderCheckSubject | null> {
        const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId },
            relations: ['lines', 'lines.productVariant'],
        });
        if (!order) return null;
        const counterparty = order.customerId
            ? await this.counterpartyService.getForCustomer(ctx, order.customerId)
            : null;
        const erpIdByProductId = await this.productErpIds(order);
        return {
            orderId: String(order.id),
            orderCode: order.code,
            customerId: order.customerId ? String(order.customerId) : null,
            buyerCounterpartyId: counterparty ? String(counterparty.id) : null,
            warehouseErpId: await this.resolveWarehouse(ctx, order),
            lines: order.lines.map(line => ({
                lineId: String(line.id),
                productVariantId: String(line.productVariantId),
                sku: line.productVariant?.sku ?? '',
                productErpId: line.productVariant?.productId
                    ? (erpIdByProductId.get(String(line.productVariant.productId)) ?? null)
                    : null,
                quantity: line.quantity,
                storageUnitRatioToBase: 1,
            })),
        };
    }

    // Active reservations say where the stock actually sits; before them, the best candidate per line.
    private async resolveWarehouse(ctx: RequestContext, order: Order): Promise<string | null> {
        const reservations = await this.connection
            .getRepository(ctx, Reservation)
            .find({ where: { orderId: String(order.id), status: 'active' } });
        const quantityByLocation = new Map<string, number>();
        if (reservations.length > 0) {
            for (const r of reservations) {
                quantityByLocation.set(
                    r.stockLocationId,
                    (quantityByLocation.get(r.stockLocationId) ?? 0) + r.quantity,
                );
            }
        } else {
            const branchId = order.customFields?.branchId ?? null;
            const candidates = branchId
                ? await this.availabilityService.findBranchStockLocationIds(ctx, branchId)
                : [];
            if (candidates.length === 0) return null;
            for (const line of order.lines) {
                const { stockLocationId } = await pickLocationWithMostFreeStock(
                    this.connection,
                    ctx,
                    line.productVariantId,
                    candidates,
                    { lock: false },
                );
                quantityByLocation.set(
                    stockLocationId,
                    (quantityByLocation.get(stockLocationId) ?? 0) + line.quantity,
                );
            }
        }
        if (quantityByLocation.size === 0) return null;
        return pickOrderWarehouse(await this.warehouseByLocation(quantityByLocation));
    }

    private async warehouseByLocation(
        quantityByLocation: Map<string, number>,
    ): Promise<Map<string, number>> {
        const rows = await this.connection.rawConnection
            .createQueryBuilder()
            .select('sl.id', 'id')
            .addSelect('sl."customFieldsWarehouseerpid"', 'warehouseErpId')
            .from('stock_location', 'sl')
            .where('sl.id IN (:...ids)', { ids: [...quantityByLocation.keys()] })
            .getRawMany<{ id: string; warehouseErpId: string | null }>();
        const quantityByWarehouse = new Map<string, number>();
        for (const row of rows) {
            if (!row.warehouseErpId) continue;
            quantityByWarehouse.set(
                row.warehouseErpId,
                (quantityByWarehouse.get(row.warehouseErpId) ?? 0) +
                    (quantityByLocation.get(String(row.id)) ?? 0),
            );
        }
        return quantityByWarehouse;
    }

    private async productErpIds(order: Order): Promise<Map<string, string>> {
        const ids = [
            ...new Set(
                order.lines
                    .map(l => l.productVariant?.productId)
                    .filter(id => id != null)
                    .map(String),
            ),
        ];
        const result = new Map<string, string>();
        if (ids.length === 0) return result;
        const rows = await this.connection.rawConnection
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p."customFieldsExternalid"', 'externalId')
            .from('product', 'p')
            .where('p.id IN (:...ids)', { ids })
            .getRawMany<{ id: string; externalId: string | null }>();
        for (const row of rows) {
            if (row.externalId) result.set(String(row.id), row.externalId);
        }
        return result;
    }
}
