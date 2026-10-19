import { Injectable } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { Reservation } from './entities/reservation.entity';
import { pickOrderWarehouse } from './order-check-subject';
import type { OrderCheckSubject } from './order-check-subject';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { pickLocationWithMostFreeStock } from './reservation-location-picker';
import { ctxQuery } from 'shared';

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
        const erpIdByProductId = await this.productErpIds(ctx, order);
        const organizationErpIds = await this.organizationErpIds(ctx, order);
        return {
            orderId: String(order.id),
            orderCode: order.code,
            customerId: order.customerId ? String(order.customerId) : null,
            branchId: order.customFields?.branchId ?? null,
            buyerCounterpartyId: counterparty ? String(counterparty.id) : null,
            warehouseErpId: await this.resolveWarehouse(ctx, order),
            lines: order.lines.map(line => ({
                lineId: String(line.id),
                productVariantId: String(line.productVariantId),
                sku: line.productVariant?.sku ?? '',
                productErpId: line.productVariant?.productId
                    ? (erpIdByProductId.get(String(line.productVariant.productId)) ?? null)
                    : null,
                organizationErpId:
                    organizationErpIds.get(String(line.customFields?.organizationId)) ?? null,
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
        return pickOrderWarehouse(await this.warehouseByLocation(ctx, quantityByLocation));
    }

    private async warehouseByLocation(
        ctx: RequestContext,
        quantityByLocation: Map<string, number>,
    ): Promise<Map<string, number>> {
        const rows = await ctxQuery<Array<{ id: string; warehouseErpId: string | null }>>(
            this.connection,
            ctx,
            `SELECT sl.id, sl."customFieldsWarehouseerpid" AS "warehouseErpId"
               FROM stock_location sl WHERE sl.id = ANY($1)`,
            [[...quantityByLocation.keys()].map(Number)],
        );
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

    private async organizationErpIds(
        ctx: RequestContext,
        order: Order,
    ): Promise<Map<string, string>> {
        const ids = [
            ...new Set(
                order.lines
                    .map(l => l.customFields?.organizationId)
                    .filter(id => id != null)
                    .map(Number),
            ),
        ];
        if (ids.length === 0) return new Map();
        const rows = await ctxQuery<Array<{ id: number; erpId: string }>>(
            this.connection,
            ctx,
            `SELECT o.id, o."erpId" FROM organization_requisites o WHERE o.id = ANY($1)`,
            [ids],
        );
        return new Map(rows.map(r => [String(r.id), r.erpId]));
    }

    private async productErpIds(ctx: RequestContext, order: Order): Promise<Map<string, string>> {
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
        const rows = await ctxQuery<Array<{ id: string; externalId: string | null }>>(
            this.connection,
            ctx,
            `SELECT p.id, p."customFieldsExternalid" AS "externalId" FROM product p WHERE p.id = ANY($1)`,
            [ids.map(Number)],
        );
        for (const row of rows) {
            if (row.externalId) result.set(String(row.id), row.externalId);
        }
        return result;
    }
}
