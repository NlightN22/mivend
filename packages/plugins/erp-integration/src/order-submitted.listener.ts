import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import { Allocation, EventBus, Logger, Order, TransactionalConnection } from '@vendure/core';
import type { ID } from '@vendure/common/lib/shared-types';
import { OrderReadyForErpEvent } from '@mivend/plugin-erp-order';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { subscribeAndLog } from 'shared';

import { IntegrationOutboxService } from './integration-outbox.service';
import type { OrderSubmittedLine, OrderSubmittedPayload } from './schemas/order-submitted.schema';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

const loggerCtx = 'OrderSubmittedListener';

interface OrderSubmittedGroup {
    organizationId: string;
    warehouseId: string;
    lines: OrderSubmittedLine[];
}

// OrderReadyForErpEvent already exists as this codebase's own "order was just placed, ERP-facing
// side needs to know" signal (see plugin-erp-order's ErpOrderService.onOrderPlaced) — reused here
// rather than adding a second listener on OrderStateTransitionEvent for the same moment.
@Injectable()
export class OrderSubmittedListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly dataSource: DataSource,
        private readonly connection: TransactionalConnection,
        private readonly outboxService: IntegrationOutboxService,
        private readonly counterpartyService: CounterpartyService,
        private readonly customerPricingService: CustomerPricingService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        if (this.options.instanceType !== 'central') return;

        subscribeAndLog(
            this.eventBus,
            OrderReadyForErpEvent,
            event => this.handle(event),
            OrderSubmittedListener.name,
        );
    }

    private async handle(event: OrderReadyForErpEvent): Promise<void> {
        const order = await this.connection.getRepository(event.ctx, Order).findOne({
            where: { id: event.orderId },
            relations: ['lines', 'lines.productVariant'],
        });
        if (!order) return;

        // customerId (mivend#85): Counterparty.erpId for the order's customer — the direct
        // Customer.customFields.counterpartyId link (CounterpartyService.getForCustomer), not a
        // TradingPoint hop. No customer at all (a guest checkout) or no Counterparty resolved
        // (e.g. a TradingPoint not yet ERP-synced) means there is no valid customerId to report
        // yet — matches this listener's existing tolerance for unresolved data at this point.
        if (!order.customerId) {
            Logger.verbose(`order ${order.id}: no customer, skipping order.submitted`, loggerCtx);
            return;
        }
        const customerVendureId = order.customerId;
        const counterparty = await this.counterpartyService.getForCustomer(
            event.ctx,
            customerVendureId,
        );
        if (!counterparty) {
            Logger.verbose(
                `order ${order.id}: no Counterparty resolved for customer ${String(order.customerId)}, skipping order.submitted`,
                loggerCtx,
            );
            return;
        }
        const customerId = counterparty.erpId;

        // priceTypeId is the customer's own assigned PriceType, the same for every line of this
        // order — null when the customer has no PriceType assignment and no plugin default.
        const priceType = await this.customerPricingService.getCustomerPriceType(
            event.ctx,
            customerVendureId,
        );
        const priceTypeId = priceType?.externalId ?? null;

        // warehouseId (mivend#85) is resolved per OrderLine, not per Order — one order can
        // allocate across multiple StockLocations/warehouses (see BranchStockLocationStrategy).
        // First Allocation wins if a line was ever split across locations, mirroring
        // BranchStockLocationStrategy.forAllocation's own one-location-per-line result.
        const warehouseIdByLineId = new Map<string, string>();
        if (order.lines.length > 0) {
            const allocations = await this.connection.getRepository(event.ctx, Allocation).find({
                where: { orderLine: { id: In(order.lines.map(line => line.id)) } },
                relations: ['orderLine', 'stockLocation'],
            });
            for (const allocation of allocations) {
                const lineId = String(allocation.orderLine.id);
                const warehouseErpId = allocation.stockLocation?.customFields?.warehouseErpId;
                if (warehouseErpId && !warehouseIdByLineId.has(lineId)) {
                    warehouseIdByLineId.set(lineId, warehouseErpId);
                }
            }
        }

        // Product.customFields.externalId (the ERP product entityId) isn't visible on the
        // typed entity from this plugin's own TS project (same reason product.handler.ts's own
        // ProductStreamHandler reads it via raw SQL rather than a typed relation) — read via the
        // same `customFieldsExternalid` raw-column lookup every other handler in this plugin
        // already uses (see price.handler.ts/stock.handler.ts).
        const productIds = [
            ...new Set(
                order.lines
                    .map(line => line.productVariant?.productId)
                    .filter((id): id is ID => id != null),
            ),
        ];
        const productExternalIdByProductId = new Map<string, string>();
        if (productIds.length > 0) {
            const rows = await this.connection.rawConnection
                .createQueryBuilder()
                .select('p.id', 'id')
                .addSelect('p."customFieldsExternalid"', 'externalId')
                .from('product', 'p')
                .where('p.id IN (:...ids)', { ids: productIds })
                .getRawMany<{ id: string; externalId: string | null }>();
            for (const row of rows) {
                if (row.externalId)
                    productExternalIdByProductId.set(String(row.id), row.externalId);
            }
        }

        // Fan-out by (organizationId, warehouseId): search-platform#105's OrderRegistrationRequestDto
        // (confirmed with search-platform, see mivend#85) takes a single top-level organizationId
        // and warehouseId per command — an order whose lines span more than one of either must
        // become one OrderSubmittedPayload per distinct combination, each carrying only the lines
        // that belong to it. Extends this listener's pre-existing organizationId-only fan-out
        // (see git history / InvoiceService.computeInvoiceSplit's "one fact per organization"
        // precedent) to the same treatment for warehouseId.
        const groups = new Map<string, OrderSubmittedGroup>();
        for (const line of order.lines) {
            const organizationId = line.productVariant?.customFields?.organizationId;
            const warehouseId = warehouseIdByLineId.get(String(line.id));
            const productId = line.productVariant?.productId
                ? productExternalIdByProductId.get(String(line.productVariant.productId))
                : undefined;
            if (organizationId == null || !warehouseId || !productId) {
                // Missing organization, warehouse, or ERP product id for this line — cannot be
                // reported yet. Skipped, never fabricated; logged so a stuck line stays visible.
                Logger.warn(
                    `orderLine ${line.id}: cannot build order.submitted line ` +
                        `(organizationId=${String(organizationId)}, warehouseId=${warehouseId}, productId=${String(productId)})`,
                    loggerCtx,
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

        if (groups.size === 0) {
            // No line resolved organization+warehouse+product yet — nothing to report to
            // Integration Service about. Not an error: matches ErpOrderService.onOrderPlaced's
            // own tolerance for a missing trading point/branch at placement time.
            return;
        }

        const payloads: OrderSubmittedPayload[] = [...groups.values()].map(group => ({
            eventId: randomUUID(),
            orderId: event.orderId,
            orderCode: event.orderCode,
            organizationId: group.organizationId,
            customerId,
            warehouseId: group.warehouseId,
            lines: group.lines,
            submittedAt: new Date().toISOString(),
            totalWithTax: order.totalWithTax,
            currencyCode: order.currencyCode,
        }));

        // Deliberate, documented deviation from the outbox-pattern messaging invariant's letter ("outbox write
        // in the same DB transaction as the business data"): the Order write already committed
        // via Vendure core before OrderReadyForErpEvent fires — there is no open transaction left
        // to join. The rule's actual intent (no window where business data exists without a
        // corresponding outbox record, or vice versa) is not achievable here for the same reason
        // it isn't for plugin-sync's own EventBus-triggered outbox writes (see
        // outbox-atomicity.int.test.ts's doc comment there): the write happens in its own
        // transaction, is at-least-once (a crash between commit and event delivery means this
        // handler may simply never run for that order — no retry mechanism re-fires
        // OrderReadyForErpEvent), and is a known, accepted gap shared with the rest of this
        // codebase's EventBus-reactive outbox producers, not something this plugin introduces
        // new. A stronger guarantee would require moving this write inside
        // ErpOrderService.onOrderPlaced's own transaction (a cross-plugin coupling this issue's
        // milestone scope deliberately avoided) or a periodic reconciliation sweep — neither
        // implemented here.
        //
        // All groups for one order are written in a single transaction: a partial publish
        // (order reported to Integration Service for one group but not another) is a worse,
        // harder-to-reconcile state than the whole order's outbox write failing together —
        // matches SyncService.processErpChanges's own multi-event-batch-in-one-transaction
        // precedent.
        await this.dataSource.transaction(async em => {
            for (const payload of payloads) {
                await this.outboxService.writeToOutbox(em, {
                    eventId: payload.eventId,
                    eventType: 'order.submitted',
                    payload: payload as unknown as Record<string, unknown>,
                });
            }
        });
    }
}
