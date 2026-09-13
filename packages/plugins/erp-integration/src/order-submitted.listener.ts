import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { EventBus, Logger, Order, TransactionalConnection } from '@vendure/core';
import type { ID } from '@vendure/common/lib/shared-types';
import { OrderReservedEvent, ReservationService } from '@mivend/plugin-reservation';
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

// mivend#85: triggers off plugin-reservation's OrderReservedEvent, not plugin-erp-order's
// OrderReadyForErpEvent — this project's real per-line warehouse fact is the custom Reservation
// entity (see docs/order-flow.md's two-stage reservation model), not Vendure's native
// Allocation, and it doesn't exist yet at OrderReadyForErpEvent's (much earlier) firing point.
// ReservationService.reserveOrder() already gates on every field this listener needs
// (customerId/productId/warehouseId — see ErpExportDataMissingError) before writing any
// Reservation at all, so by the time OrderReservedEvent fires, all of it should already resolve;
// this listener's own skip/log path below is a should-never-happen safety net, not a normal path.
@Injectable()
export class OrderSubmittedListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly dataSource: DataSource,
        private readonly connection: TransactionalConnection,
        private readonly outboxService: IntegrationOutboxService,
        private readonly counterpartyService: CounterpartyService,
        private readonly customerPricingService: CustomerPricingService,
        private readonly reservationService: ReservationService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        if (this.options.instanceType !== 'central') return;

        subscribeAndLog(
            this.eventBus,
            OrderReservedEvent,
            event => this.handle(event),
            OrderSubmittedListener.name,
        );
    }

    private async handle(event: OrderReservedEvent): Promise<void> {
        const order = await this.connection.getRepository(event.ctx, Order).findOne({
            where: { id: event.orderId },
            relations: ['lines', 'lines.productVariant'],
        });
        if (!order) return;

        // customerId: Counterparty.erpId for the order's customer — the direct
        // Customer.customFields.counterpartyId link (CounterpartyService.getForCustomer).
        // Already verified resolvable by reserveOrder()'s gate; re-checked here defensively.
        if (!order.customerId) {
            Logger.warn(
                `order ${order.id}: OrderReservedEvent fired with no customer — should be unreachable, reserveOrder() gates on this`,
                loggerCtx,
            );
            return;
        }
        const customerVendureId = order.customerId;
        const counterparty = await this.counterpartyService.getForCustomer(
            event.ctx,
            customerVendureId,
        );
        if (!counterparty) {
            Logger.warn(
                `order ${order.id}: no Counterparty resolved for customer ${String(order.customerId)} — should be unreachable, reserveOrder() gates on this`,
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

        // warehouseId (mivend#85): sourced from this project's own Reservation entity, not
        // Vendure's native Allocation — see this file's own doc comment above and
        // docs/order-flow.md's two-stage reservation model. Only 'active' reservations count;
        // a released/expired one no longer reflects where this order's stock actually sits.
        const reservations = (
            await this.reservationService.findForOrder(event.ctx, event.orderId)
        ).filter(r => r.status === 'active');
        const warehouseIdByLineId = new Map<string, string>();
        if (reservations.length > 0) {
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
                if (row.warehouseErpId) {
                    warehouseErpIdByLocationId.set(String(row.id), row.warehouseErpId);
                }
            }
            for (const reservation of reservations) {
                const warehouseErpId = warehouseErpIdByLocationId.get(reservation.stockLocationId);
                if (warehouseErpId) {
                    warehouseIdByLineId.set(reservation.orderLineId, warehouseErpId);
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
                // Should be unreachable — reserveOrder()'s ERP-export-readiness gate already
                // verified productId/warehouseId for every line before this event could ever
                // fire. Skipped, never fabricated; logged loudly so a real divergence between
                // that gate and this listener is never silently swallowed.
                Logger.error(
                    `orderLine ${line.id}: cannot build order.submitted line despite reserveOrder()'s gate ` +
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
            return;
        }

        const payloads: OrderSubmittedPayload[] = [...groups.values()].map(group => ({
            eventId: randomUUID(),
            orderId: String(event.orderId),
            orderCode: event.orderCode,
            organizationId: group.organizationId,
            customerId,
            warehouseId: group.warehouseId,
            lines: group.lines,
            submittedAt: new Date().toISOString(),
            totalWithTax: order.totalWithTax,
            currencyCode: order.currencyCode,
        }));

        // Deliberate, documented deviation from the outbox-pattern messaging invariant's letter
        // ("outbox write in the same DB transaction as the business data"): the Reservation write
        // already committed via ReservationService.reserveOrder() before OrderReservedEvent
        // fires — there is no open transaction left to join. The rule's actual intent (no window
        // where business data exists without a corresponding outbox record, or vice versa) is
        // not achievable here for the same reason it isn't for plugin-sync's own EventBus-
        // triggered outbox writes (see outbox-atomicity.int.test.ts's doc comment there): the
        // write happens in its own transaction, is at-least-once (a crash between commit and
        // event delivery means this handler may simply never run for that order — no retry
        // mechanism re-fires OrderReservedEvent), and is a known, accepted gap shared with the
        // rest of this codebase's EventBus-reactive outbox producers, not something this plugin
        // introduces new.
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
