import { OrderStatusReferenceService } from '@mivend/plugin-erp-order';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import type { ID } from '@vendure/common/lib/shared-types';
import { PackagingPolicyService, wholePacks } from '@mivend/plugin-moq';
import { OrderLineIdentityService } from '@mivend/plugin-order-identity';
import { ReservationService } from '@mivend/plugin-reservation';
import {
    ContractService,
    CounterpartyService,
    TradingPointService,
} from '@mivend/plugin-counterparty';
import { FREIGHT_SHIPPING_METHOD_CODE } from '@mivend/plugin-freight-shipping';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';

import { OrderSendHoldService } from './order-checks/order-send-hold.service';
import { outboundSend, outboundSkip, OutboundGateway } from './outbound-gateway';
import type { OutboundBuildResult } from './outbound-gateway';
import type { OrderSubmittedLine, OrderSubmittedPayload } from './schemas/order-submitted.schema';

interface ActiveReservations {
    warehouseIdByLineId: Map<string, string>;
    reserveUntil: Date | null;
}

// Builds the single order.confirmed payload for one order, or a skip with the reason. Sent whole
// or not at all: a partial order cannot be completed in the ERP later, a skipped one can be rebuilt.
@Injectable()
export class OrderSubmittedBuilder {
    private readonly logger = new Logger(OrderSubmittedBuilder.name);

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterpartyService: CounterpartyService,
        private readonly contractService: ContractService,
        private readonly customerPricingService: CustomerPricingService,
        private readonly reservationService: ReservationService,
        private readonly outboundGateway: OutboundGateway,
        private readonly packagingPolicyService: PackagingPolicyService,
        private readonly orderLineIdentityService: OrderLineIdentityService,
        private readonly statuses: OrderStatusReferenceService,
        private readonly tradingPointService: TradingPointService,
        private readonly sendHold: OrderSendHoldService,
    ) {}

    async build(ctx: RequestContext, orderId: ID, orderCode: string): Promise<OutboundBuildResult> {
        const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId },
            relations: [
                'lines',
                'lines.productVariant',
                'shippingLines',
                'shippingLines.shippingMethod',
            ],
        });
        if (!order) return outboundSkip(`order ${String(orderId)} not found`);
        if (order.state === 'Cancelled')
            return outboundSkip(`order ${String(orderId)} is cancelled`);
        if (!order.customerId) return outboundSkip('order has no customer');
        if (order.lines.length === 0) return outboundSkip('order has no lines');
        const orderUuid = order.customFields?.uuid;
        if (!orderUuid) return outboundSkip(`order ${String(orderId)} has no uuid`);

        const alreadySubmitted = await this.wasAlreadySubmitted(ctx, orderId, order);
        if (alreadySubmitted) {
            return outboundSkip(`order ${orderUuid} already submitted`);
        }

        const counterparty = await this.counterpartyService.getForCustomer(ctx, order.customerId);
        if (!counterparty) {
            return outboundSkip(`no Counterparty for customer ${String(order.customerId)}`);
        }

        const contract = await this.contractService.resolveOrderContract(
            ctx,
            counterparty,
            order.customFields?.selectedContractId,
            order.customerId,
        );
        if (!contract) {
            return outboundSkip(`no active contract for counterparty ${counterparty.erpId}`);
        }

        const priceType = await this.customerPricingService.getCustomerPriceType(
            ctx,
            order.customerId,
        );
        const priceTypeId = priceType?.externalId ?? null;
        const { warehouseIdByLineId, reserveUntil } = await this.loadActiveReservations(
            ctx,
            orderId,
        );
        if (!reserveUntil) return outboundSkip('order has no active reservation');
        if (await this.sendHold.isHeld(ctx, String(orderId))) {
            return outboundSkip('held by an order check policy (pre-send-to-erp)');
        }
        const productExternalIdByProductId = await this.loadProductExternalIds(
            order.lines.map(line => line.productVariant?.productId),
        );

        const lineUuidById = await this.orderLineIdentityService.uuidsByLineId(
            ctx,
            order.lines.map(line => line.id),
        );

        const packagesOnly = await this.packagingPolicyService.isPackagesOnly(
            ctx,
            order.customerId,
            order.customFields?.branchId ?? null,
        );

        const unbuildable: string[] = [];
        const lines: OrderSubmittedLine[] = [];
        const quantityByWarehouse = new Map<string, number>();
        for (const line of order.lines) {
            const warehouseId = warehouseIdByLineId.get(String(line.id));
            const productId = line.productVariant?.productId
                ? productExternalIdByProductId.get(String(line.productVariant.productId))
                : undefined;
            const lineUuid = lineUuidById.get(String(line.id));
            if (!warehouseId || !productId || !lineUuid) {
                unbuildable.push(
                    `line ${String(line.id)} (warehouseId=${String(warehouseId)}, ` +
                        `productId=${String(productId)}, lineUuid=${String(lineUuid)})`,
                );
                continue;
            }
            quantityByWarehouse.set(
                warehouseId,
                (quantityByWarehouse.get(warehouseId) ?? 0) + line.quantity,
            );
            const unitId = line.productVariant?.customFields?.defaultSalesUnitId;
            const ratio = line.productVariant?.customFields?.unitRatioToBase;
            // A quantity that is not whole packs (flag switched on after the line was added) goes by base unit.
            const packs =
                packagesOnly && !!unitId && !!ratio && ratio > 0 && ratio !== 1
                    ? wholePacks(line.quantity, ratio)
                    : null;
            lines.push({
                productId,
                quantity: packs ?? line.quantity,
                ...(packs !== null && unitId ? { unitId } : {}),
                priceTypeId,
                lineUuid,
            });
        }
        if (unbuildable.length > 0) {
            return outboundSkip(`cannot build order lines: ${unbuildable.join('; ')}`);
        }

        // One warehouse per order: the one holding the most quantity, ties broken by id.
        const [warehouseId] = [...quantityByWarehouse.entries()].sort(
            ([idA, qtyA], [idB, qtyB]) => qtyB - qtyA || (idA < idB ? -1 : 1),
        )[0];
        const delivery = await this.resolveDelivery(ctx, order);
        const payload: OrderSubmittedPayload = {
            eventId: randomUUID(),
            orderId: String(orderId),
            orderCode,
            orderUuid,
            orderNumber: orderCode,
            organizationId: contract.organizationId,
            contractId: contract.erpId,
            customerId: counterparty.erpId,
            warehouseId,
            ...delivery,
            lines,
            submittedAt: new Date().toISOString(),
            totalWithTax: order.totalWithTax,
            currencyCode: order.currencyCode,
            type: 'confirmed',
            reserveUntil: reserveUntil.toISOString(),
        };
        return outboundSend([
            { eventId: payload.eventId, payload: payload as unknown as Record<string, unknown> },
        ]);
    }

    // Only pointOfSaleId makes it a delivery; the address text is for printed documents. A
    // customer-added point has no ERP id, so its order is registered as pickup.
    private async resolveDelivery(
        ctx: RequestContext,
        order: Order,
    ): Promise<Pick<OrderSubmittedPayload, 'pointOfSaleId' | 'deliveryAddress'>> {
        const isDelivery = order.shippingLines?.some(
            line => line.shippingMethod?.code === FREIGHT_SHIPPING_METHOD_CODE,
        );
        const tradingPointId = order.customFields?.tradingPointId;
        if (!isDelivery || !tradingPointId) return {};
        const point = await this.tradingPointService.findById(ctx, tradingPointId);
        if (!point) return {};
        if (point.customerOwned) {
            this.logger.warn(
                `Order ${order.code}: delivery to a customer-owned point is submitted as pickup`,
            );
            return {};
        }
        return {
            pointOfSaleId: point.erpId,
            ...(point.address ? { deliveryAddress: point.address } : {}),
        };
    }

    // One external effect per order unless the ERP rejected the previous submission; see
    // docs/identifiers.md "Implementation status" (issue #199 guard).
    private async wasAlreadySubmitted(
        ctx: RequestContext,
        orderId: ID,
        order: Order,
    ): Promise<boolean> {
        const dictionary = await this.statuses.dictionary(ctx);
        if (dictionary.has(order.customFields?.erpStatus, 'rejected')) return false;
        return this.outboundGateway.hasActiveEntry('order.confirmed', String(orderId));
    }

    // Only active reservations count; a released/expired one no longer reflects where the stock sits.
    private async loadActiveReservations(
        ctx: RequestContext,
        orderId: ID,
    ): Promise<ActiveReservations> {
        const reservations = (await this.reservationService.findForOrder(ctx, orderId)).filter(
            r => r.status === 'active',
        );
        const warehouseIdByLineId = new Map<string, string>();
        if (reservations.length === 0) return { warehouseIdByLineId, reserveUntil: null };
        // The earliest deadline: the ERP must never keep a reserve past ours.
        const reserveUntil = new Date(Math.min(...reservations.map(r => r.expiresAt.getTime())));

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
            if (warehouseErpId) warehouseIdByLineId.set(reservation.orderLineId, warehouseErpId);
        }
        return { warehouseIdByLineId, reserveUntil };
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
