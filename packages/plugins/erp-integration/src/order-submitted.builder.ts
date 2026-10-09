import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import type { ID } from '@vendure/common/lib/shared-types';
import { ReservationService } from '@mivend/plugin-reservation';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';

import { outboundSend, outboundSkip, OutboundGateway } from './outbound-gateway';
import type { OutboundBuildResult } from './outbound-gateway';
import type { OrderSubmittedLine, OrderSubmittedPayload } from './schemas/order-submitted.schema';

interface OrderSubmittedGroup {
    warehouseId: string;
    lines: OrderSubmittedLine[];
}

// Builds the order.submitted payloads for one order, or a skip with the reason. Sent whole or not
// at all: a partial order cannot be completed in the ERP later, a skipped one can be rebuilt.
@Injectable()
export class OrderSubmittedBuilder {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterpartyService: CounterpartyService,
        private readonly contractService: ContractService,
        private readonly customerPricingService: CustomerPricingService,
        private readonly reservationService: ReservationService,
        private readonly outboundGateway: OutboundGateway,
    ) {}

    async build(ctx: RequestContext, orderId: ID, orderCode: string): Promise<OutboundBuildResult> {
        const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId },
            relations: ['lines', 'lines.productVariant'],
        });
        if (!order) return outboundSkip(`order ${String(orderId)} not found`);
        if (!order.customerId) return outboundSkip('order has no customer');
        if (order.lines.length === 0) return outboundSkip('order has no lines');

        const alreadySubmitted = await this.wasAlreadySubmitted(orderId, order);
        if (alreadySubmitted) {
            const orderUuid = order.customFields?.uuid ?? String(orderId);
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
        const warehouseIdByLineId = await this.loadWarehouseIdsByLine(ctx, orderId);
        const productExternalIdByProductId = await this.loadProductExternalIds(
            order.lines.map(line => line.productVariant?.productId),
        );

        const unbuildable: string[] = [];
        const groups = new Map<string, OrderSubmittedGroup>();
        for (const line of order.lines) {
            const warehouseId = warehouseIdByLineId.get(String(line.id));
            const productId = line.productVariant?.productId
                ? productExternalIdByProductId.get(String(line.productVariant.productId))
                : undefined;
            if (!warehouseId || !productId) {
                unbuildable.push(
                    `line ${String(line.id)} (warehouseId=${String(warehouseId)}, ` +
                        `productId=${String(productId)})`,
                );
                continue;
            }
            let group = groups.get(warehouseId);
            if (!group) {
                group = { warehouseId, lines: [] };
                groups.set(warehouseId, group);
            }
            group.lines.push({
                productId,
                quantity: line.quantity,
                priceTypeId,
                lineUuid: line.customFields.uuid,
            });
        }
        if (unbuildable.length > 0) {
            return outboundSkip(`cannot build order lines: ${unbuildable.join('; ')}`);
        }

        // One payload per warehouse; the header organization is the contract's and the ERP
        // distributes line organizations itself.
        return outboundSend(
            [...groups.values()].map(group => {
                const payload: OrderSubmittedPayload = {
                    eventId: randomUUID(),
                    orderId: String(orderId),
                    orderCode,
                    orderUuid: order.customFields.uuid,
                    orderNumber: orderCode,
                    organizationId: contract.organizationId,
                    contractId: contract.erpId,
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

    // Blocks a second external effect for the same order (re-confirm, release-then-reconfirm,
    // expiry-then-reconfirm — issue #199/docs/identifiers.md's "Exchange" guard), unless the ERP
    // rejected the previous submission (decision 5: a re-submit is then allowed). No dedicated
    // "ERP rejected" signal exists on IntegrationOutboxEntry today, so this checks
    // Order.customFields.erpStatus === 'REJECTED' (set by ReservationWriteOffSyncService from the
    // ERP's own registration result) as the only known rejection fact; any other non-skipped,
    // non-failed prior entry for this order blocks a new submit.
    private async wasAlreadySubmitted(orderId: ID, order: Order): Promise<boolean> {
        if (order.customFields?.erpStatus === 'REJECTED') return false;
        return this.outboundGateway.hasActiveEntryForOrder('order.submitted', String(orderId));
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
