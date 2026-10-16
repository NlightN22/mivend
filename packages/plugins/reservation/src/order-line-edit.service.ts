import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { HistoryEntryType } from '@vendure/common/lib/generated-types';
import {
    EventBus,
    HistoryService,
    Order,
    OrderLine,
    OrderService,
    Payment,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { OrderStatusReferenceService, OrderVisibilityService } from '@mivend/plugin-erp-order';
import { PackagingPolicyService } from '@mivend/plugin-moq';
import { withAggregateLock } from 'shared';

import { OrderLineShortfall } from './entities/order-line-shortfall.entity';
import { OrderLinesEditedEvent } from './order-line-edit.events';
import { OrderLineAvailabilityPortRegistry } from './order-line-availability.port';
import type { LineAvailability } from './order-line-availability.port';
import { planSplit } from './order-line-split';
import { OrderChecksService } from './order-checks.service';
import { ReservationService } from './reservation.service';

export interface SplitOutcome {
    lineId: string;
    requested: number;
    kept: number;
    shortfall: number;
}

// Staff edit of an order's lines before it is confirmed (#233): no active reservation, not yet in
// the ERP, nothing paid. Same lock as reserveOrder, checks recomputed at the on-edit stage.
@Injectable()
export class OrderLineEditService {
    constructor(
        private connection: TransactionalConnection,
        private visibility: OrderVisibilityService,
        private statuses: OrderStatusReferenceService,
        private reservations: ReservationService,
        private orderService: OrderService,
        private history: HistoryService,
        private eventBus: EventBus,
        private packaging: PackagingPolicyService,
        private availabilityPorts: OrderLineAvailabilityPortRegistry,
        private orderChecks: OrderChecksService,
    ) {}

    availability(ctx: RequestContext, orderId: ID): Promise<LineAvailability[]> {
        return this.visible(ctx, orderId).then(() =>
            this.availabilityPorts.get().forOrder(ctx, String(orderId)),
        );
    }

    setQuantity(ctx: RequestContext, orderId: ID, lineId: ID, quantity: number): Promise<void> {
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new UserInputError(
                'Quantity must be a positive whole number; remove the line instead',
            );
        }
        return this.edit(ctx, orderId, 'quantity', async (txCtx, order) => {
            const line = this.lineOf(order, lineId);
            await this.assertMultiple(txCtx, order, line, quantity);
            const before = line.quantity;
            line.quantity = quantity;
            await this.persist(txCtx, order, [line]);
            return `Line ${line.productVariant.sku}: quantity ${before} -> ${quantity}`;
        });
    }

    removeLine(ctx: RequestContext, orderId: ID, lineId: ID): Promise<void> {
        return this.edit(ctx, orderId, 'remove', async (txCtx, order) => {
            const line = this.lineOf(order, lineId);
            this.assertNotLast(order, 1);
            await this.connection.getRepository(txCtx, OrderLine).remove(line);
            order.lines = order.lines.filter(l => String(l.id) !== String(lineId));
            await this.persist(txCtx, order, order.lines);
            return `Line ${line.productVariant.sku} removed (was ${line.quantity})`;
        });
    }

    // Cuts every line to the part the warehouse and its own organization can cover and records the rest as shortfall.
    async splitByStock(ctx: RequestContext, orderId: ID): Promise<SplitOutcome[]> {
        let outcomes: SplitOutcome[] = [];
        await this.edit(ctx, orderId, 'split', async (txCtx, order) => {
            const availability = await this.availabilityPorts
                .get()
                .forOrder(txCtx, String(orderId));
            const plans = new Map<
                string,
                { plan: ReturnType<typeof planSplit>; info: LineAvailability }
            >();
            for (const line of order.lines) {
                const info = availability.find(a => a.lineId === String(line.id));
                if (!info || info.fitting >= line.quantity) continue;
                const multiple = await this.requiredMultiple(txCtx, order, line);
                plans.set(String(line.id), {
                    plan: planSplit(line.quantity, info.fitting, multiple),
                    info,
                });
            }
            if (plans.size === 0)
                throw new UserInputError('Every line is already covered by stock');
            const removed = [...plans.values()].filter(p => p.plan.keep === 0).length;
            this.assertNotLast(order, removed);
            const shortfalls: OrderLineShortfall[] = [];
            outcomes = [];
            for (const line of [...order.lines]) {
                const entry = plans.get(String(line.id));
                if (!entry) continue;
                const { plan, info } = entry;
                shortfalls.push(
                    this.shortfallRow(txCtx, order, line, plan.keep, plan.shortfall, info),
                );
                outcomes.push({
                    lineId: String(line.id),
                    requested: line.quantity,
                    kept: plan.keep,
                    shortfall: plan.shortfall,
                });
                if (plan.keep === 0) {
                    const removedId = String(line.id);
                    await this.connection.getRepository(txCtx, OrderLine).remove(line);
                    order.lines = order.lines.filter(l => String(l.id) !== removedId);
                } else {
                    line.quantity = plan.keep;
                }
            }
            await this.connection.getRepository(txCtx, OrderLineShortfall).save(shortfalls);
            await this.persist(txCtx, order, order.lines);
            return `Cut to available stock: ${outcomes.map(o => `${o.requested}->${o.kept}`).join(', ')}`;
        });
        return outcomes;
    }

    private async edit(
        ctx: RequestContext,
        orderId: ID,
        kind: 'quantity' | 'remove' | 'split',
        change: (txCtx: RequestContext, order: Order) => Promise<string>,
    ): Promise<void> {
        await this.visible(ctx, orderId);
        await withAggregateLock(this.connection, ctx, `reserve-order:${orderId}`, async txCtx => {
            const order = await this.orderService.findOne(txCtx, orderId, [
                'lines',
                'lines.productVariant',
                'shippingLines',
                'surcharges',
            ]);
            if (!order) throw new UserInputError('Order not found');
            await this.assertEditable(txCtx, order);
            const note = await change(txCtx, order);
            await this.history.createHistoryEntryForOrder(
                {
                    ctx: txCtx,
                    orderId,
                    type: HistoryEntryType.ORDER_NOTE,
                    data: { note: `Lines edited by staff: ${note}` },
                },
                false,
            );
            await this.orderChecks.run(txCtx, String(orderId), 'on-edit');
            this.eventBus.publish(new OrderLinesEditedEvent(txCtx, orderId, kind));
        });
    }

    private async assertEditable(ctx: RequestContext, order: Order): Promise<void> {
        if (order.customFields?.isExternal === true) {
            throw new UserInputError('Orders from the ERP are managed there');
        }
        if (order.state === 'Cancelled') throw new UserInputError('The order is cancelled');
        const erpStatus = order.customFields?.erpStatus;
        if (erpStatus != null && !(await this.statuses.dictionary(ctx)).has(erpStatus, 'initial')) {
            throw new UserInputError('The order is already registered in the ERP');
        }
        const rows = await this.reservations.findForOrder(ctx, order.id);
        if (rows.some(r => r.status === 'active')) {
            throw new UserInputError('Release the reservation before editing the lines');
        }
        const settled = await this.connection
            .getRepository(ctx, Payment)
            .count({ where: { order: { id: order.id }, state: 'Settled' } });
        if (settled > 0)
            throw new UserInputError('A payment has already been received for this order');
    }

    private assertNotLast(order: Order, removing: number): void {
        if (order.lines.length - removing <= 0) {
            throw new UserInputError('An order cannot be left without lines; cancel it instead');
        }
    }

    private lineOf(order: Order, lineId: ID): OrderLine {
        const line = order.lines.find(l => String(l.id) === String(lineId));
        if (!line) throw new UserInputError('The order has no such line');
        return line;
    }

    private requiredMultiple(ctx: RequestContext, order: Order, line: OrderLine): Promise<number> {
        return this.packaging.requiredMultiple(
            ctx,
            line.productVariant,
            order.customerId,
            order.customFields?.branchId ?? null,
        );
    }

    private async assertMultiple(
        ctx: RequestContext,
        order: Order,
        line: OrderLine,
        quantity: number,
    ): Promise<void> {
        const multiple = await this.requiredMultiple(ctx, order, line);
        if (quantity % multiple !== 0) {
            throw new UserInputError(
                `${line.productVariant.sku} must be ordered in multiples of ${multiple}`,
            );
        }
    }

    private async persist(ctx: RequestContext, order: Order, updated: OrderLine[]): Promise<void> {
        await this.connection.getRepository(ctx, OrderLine).save(updated.filter(l => l.id != null));
        // Prices are re-resolved for every line: a quantity change moves tiers of sibling lines too.
        await this.orderService.applyPriceAdjustments(ctx, order, order.lines);
    }

    private shortfallRow(
        ctx: RequestContext,
        order: Order,
        line: OrderLine,
        kept: number,
        shortfall: number,
        info: LineAvailability,
    ): OrderLineShortfall {
        return new OrderLineShortfall({
            orderId: String(order.id),
            orderLineId: String(line.id),
            productVariantId: String(line.productVariantId),
            organizationId:
                line.customFields?.organizationId != null
                    ? String(line.customFields.organizationId)
                    : null,
            requestedQuantity: line.quantity,
            keptQuantity: kept,
            shortfallQuantity: shortfall,
            limitedBy: info.limitedBy,
            administratorId: ctx.activeUserId ? String(ctx.activeUserId) : null,
        });
    }

    private async visible(ctx: RequestContext, orderId: ID): Promise<void> {
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const order = await qb.andWhere(`${qb.alias}.id = :orderId`, { orderId }).getOne();
        if (!order) throw new UserInputError('Order not found');
    }
}
