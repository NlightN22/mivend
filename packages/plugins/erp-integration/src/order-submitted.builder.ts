import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import type { ID } from '@vendure/common/lib/shared-types';
import { ReservationService } from '@mivend/plugin-reservation';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';

import { outboundSend, outboundSkip } from './outbound-gateway';
import type { OutboundBuildResult } from './outbound-gateway';
import type { OrderSubmittedLine, OrderSubmittedPayload } from './schemas/order-submitted.schema';

interface OrderSubmittedGroup {
    organizationId: string;
    warehouseId: string;
    lines: OrderSubmittedLine[];
}

// Builds the order.submitted payloads for one order, or a skip with the reason. Triggered off
// plugin-reservation's OrderReservedEvent (see OrderSubmittedListener), since the real per-line
// warehouse fact is the custom Reservation entity (docs/order-flow.md's two-stage reservation
// model). An order is sent whole or not at all: a partial order registered in the ERP cannot be
// completed later, a skipped one can be rebuilt once the cause is fixed.
@Injectable()
export class OrderSubmittedBuilder {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterpartyService: CounterpartyService,
        private readonly customerPricingService: CustomerPricingService,
        private readonly reservationService: ReservationService,
    ) {}

    async build(ctx: RequestContext, orderId: ID, orderCode: string): Promise<OutboundBuildResult> {
        const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId },
            relations: ['lines', 'lines.productVariant'],
        });
        if (!order) return outboundSkip(`order ${String(orderId)} not found`);
        if (!order.customerId) return outboundSkip('order has no customer');
        if (order.lines.length === 0) return outboundSkip('order has no lines');

        const counterparty = await this.counterpartyService.getForCustomer(ctx, order.customerId);
        if (!counterparty) {
            return outboundSkip(`no Counterparty for customer ${String(order.customerId)}`);
        }

        const priceType = await this.customerPricingService.getCustomerPriceType(
            ctx,
            order.customerId,
        );
        const priceTypeId = priceType?.externalId ?? null;
        const warehouseIdByLineId = await this.loadWarehouseIdsByLine(ctx, orderId);
        const productExternalIdByProductId = await this.loadProductExternalIds(
            order.lines.map(line => line.productVariant?.productId),
        );

        const unbuildable: string[] = [];
        const groups = new Map<string, OrderSubmittedGroup>();
        for (const line of order.lines) {
            const organizationId = line.productVariant?.customFields?.organizationId;
            const warehouseId = warehouseIdByLineId.get(String(line.id));
            const productId = line.productVariant?.productId
                ? productExternalIdByProductId.get(String(line.productVariant.productId))
                : undefined;
            if (organizationId == null || !warehouseId || !productId) {
                unbuildable.push(
                    `line ${String(line.id)} (organizationId=${String(organizationId)}, ` +
                        `warehouseId=${String(warehouseId)}, productId=${String(productId)})`,
                );
                continue;
            }
            const key = `${organizationId}:${warehouseId}`;
            let group = groups.get(key);
            if (!group) {
                group = { organizationId: String(organizationId), warehouseId, lines: [] };
                groups.set(key, group);
            }
            group.lines.push({ productId, quantity: line.quantity, priceTypeId });
        }
        if (unbuildable.length > 0) {
            return outboundSkip(`cannot build order lines: ${unbuildable.join('; ')}`);
        }

        // One payload per distinct (organizationId, warehouseId): the command takes a single
        // organizationId and warehouseId, so an order spanning several fans out.
        return outboundSend(
            [...groups.values()].map(group => {
                const payload: OrderSubmittedPayload = {
                    eventId: randomUUID(),
                    orderId: String(orderId),
                    orderCode,
                    organizationId: group.organizationId,
                    customerId: counterparty.erpId,
                    warehouseId: group.warehouseId,
                    lines: group.lines,
                    submittedAt: new Date().toISOString(),
                    totalWithTax: order.totalWithTax,
                    currencyCode: order.currencyCode,
                };
                return {
                    eventId: payload.eventId,
                    payload: payload as unknown as Record<string, unknown>,
                };
            }),
        );
    }

    // Only active reservations count; a released/expired one no longer reflects where the stock sits.
    private async loadWarehouseIdsByLine(
        ctx: RequestContext,
        orderId: ID,
    ): Promise<Map<string, string>> {
        const reservations = (await this.reservationService.findForOrder(ctx, orderId)).filter(
            r => r.status === 'active',
        );
        const result = new Map<string, string>();
        if (reservations.length === 0) return result;

        const stockLocationIds = [...new Set(reservations.map(r => r.stockLocationId))];
        const rows = await this.connection.rawConnection
            .createQueryBuilder()
            .select('sl.id', 'id')
            .addSelect('sl."customFieldsWarehouseerpid"', 'warehouseErpId')
            .from('stock_location', 'sl')
            .where('sl.id IN (:...ids)', { ids: stockLocationIds })
            .getRawMany<{ id: string; warehouseErpId: string | null }>();
        const warehouseErpIdByLocationId = new Map<string, string>();
        for (const row of rows) {
            if (row.warehouseErpId)
                warehouseErpIdByLocationId.set(String(row.id), row.warehouseErpId);
        }
        for (const reservation of reservations) {
            const warehouseErpId = warehouseErpIdByLocationId.get(reservation.stockLocationId);
            if (warehouseErpId) result.set(reservation.orderLineId, warehouseErpId);
        }
        return result;
    }

    // Product.customFields.externalId is not visible on the typed entity from this plugin's TS
    // project, so it is read via the raw column like every other handler in this plugin.
    private async loadProductExternalIds(
        productIds: Array<ID | null | undefined>,
    ): Promise<Map<string, string>> {
        const ids = [...new Set(productIds.filter((id): id is ID => id != null))];
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
