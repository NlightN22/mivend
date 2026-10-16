import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { HistoryEntryType } from '@vendure/common/lib/generated-types';
import {
    EventBus,
    HistoryService,
    Order,
    OrderLine,
    OrderService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import { PackagingPolicyService } from '@mivend/plugin-moq';
import { withAggregateLock } from 'shared';

import { OrderLineShortfall } from './entities/order-line-shortfall.entity';
import { OrderLinesEditedEvent } from './order-line-edit.events';
import { OrderLineAvailabilityPortRegistry } from './order-line-availability.port';
import type { LineAvailability } from './order-line-availability.port';
import { planSplit } from './order-line-split';
import { OrderLineEditGuard } from './order-line-edit.guard';
import { OrderLineStockSyncService } from './order-line-stock-sync.service';
import { OrderLinesEditPortRegistry } from './order-line-edit.port';
import { OrderChecksService } from './order-checks.service';

const MAX_LINE_QUANTITY = 1_000_000;

export interface SplitOutcome {
    lineId: string;
    requested: number;
    kept: number;
    shortfall: number;
}

// Staff edit of an order's lines until it is sent to the ERP (#233). Same lock as reserveOrder,
// checks recomputed at the on-edit stage.
@Injectable()
export class OrderLineEditService {
    constructor(
        private connection: TransactionalConnection,
        private visibility: OrderVisibilityService,
        private guard: OrderLineEditGuard,
        private orderService: OrderService,
        private history: HistoryService,
        private eventBus: EventBus,
        private packaging: PackagingPolicyService,
        private availabilityPorts: OrderLineAvailabilityPortRegistry,
        private orderChecks: OrderChecksService,
        private editPorts: OrderLinesEditPortRegistry,
        private stockSync: OrderLineStockSyncService,
    ) {}

    // `step` is the pack multiple the line's quantity must respect (what the stepper moves by).
    async availability(
        ctx: RequestContext,
        orderId: ID,
    ): Promise<Array<LineAvailability & { step: number }>> {
        await this.visible(ctx, orderId);
        const rows = await this.availabilityPorts.get().forOrder(ctx, String(orderId));
        const order = await this.orderService.findOne(ctx, orderId, [
            'lines',
            'lines.productVariant',
        ]);
        const steps = new Map<string, number>();
        for (const line of order?.lines ?? []) {
            steps.set(String(line.id), await this.requiredMultiple(ctx, order as Order, line));
        }
        return rows.map(row => ({ ...row, step: steps.get(row.lineId) ?? 1 }));
    }

    async setQuantity(
        ctx: RequestContext,
        orderId: ID,
        lineId: ID,
        quantity: number,
    ): Promise<void> {
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_LINE_QUANTITY) {
            throw new UserInputError(
                `Quantity must be a whole number from 1 to ${MAX_LINE_QUANTITY}; remove the line instead`,
            );
        }
        return this.edit(ctx, orderId, 'quantity', async (txCtx, order) => {
            const line = this.lineOf(order, lineId);
            await this.assertMultiple(txCtx, order, line, quantity);
            const before = line.quantity;
            await this.stockSync.changeQuantity(txCtx, order, line, quantity - before);
            line.quantity = quantity;
            await this.persist(txCtx, order, [line]);
            return `Line ${line.productVariant.sku}: quantity ${before} -> ${quantity}`;
        });
    }

    removeLine(ctx: RequestContext, orderId: ID, lineId: ID): Promise<void> {
        return this.edit(ctx, orderId, 'remove', async (txCtx, order) => {
            const line = this.lineOf(order, lineId);
            this.assertNotLast(order, 1);
            const removedQuantity = line.quantity;
            await this.stockSync.removeLine(txCtx, order, line);
            order.lines = order.lines.filter(l => String(l.id) !== String(lineId));
            await this.persist(txCtx, order, order.lines);
            return `Line ${line.productVariant.sku} removed (was ${removedQuantity})`;
        });
    }

    // Cuts every line to the part the warehouse and its own organization can cover and records the rest as shortfall.
    async splitByStock(ctx: RequestContext, orderId: ID): Promise<SplitOutcome[]> {
        const before = await this.availability(ctx, orderId);
        if (before.every(a => a.fitting >= a.needed)) return [];
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
                    await this.stockSync.removeLine(txCtx, order, line);
                    order.lines = order.lines.filter(l => String(l.id) !== removedId);
                } else {
                    await this.stockSync.changeQuantity(
                        txCtx,
                        order,
                        line,
                        plan.keep - line.quantity,
                    );
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
        change: (txCtx: RequestContext, order: Order) => Promise<string | null>,
    ): Promise<void> {
        await this.visible(ctx, orderId);
        // Proforma lock first (alphabetical, docs/concurrency.md): the edit reissues them under it.
        await withAggregateLock(
            this.connection,
            ctx,
            `proformaInvoices-for-order:${orderId}`,
            txCtx => this.editLocked(txCtx, orderId, kind, change),
        );
    }

    private async editLocked(
        ctx: RequestContext,
        orderId: ID,
        kind: 'quantity' | 'remove' | 'split',
        change: (txCtx: RequestContext, order: Order) => Promise<string | null>,
    ): Promise<void> {
        await withAggregateLock(this.connection, ctx, `reserve-order:${orderId}`, async txCtx => {
            const order = await this.orderService.findOne(txCtx, orderId, [
                'lines',
                'lines.productVariant',
                'shippingLines',
                'surcharges',
            ]);
            if (!order) throw new UserInputError('Order not found');
            await this.guard.assertEditable(txCtx, order);
            const note = await change(txCtx, order);
            if (note === null) return;
            await this.history.createHistoryEntryForOrder(
                {
                    ctx: txCtx,
                    orderId,
                    type: HistoryEntryType.ORDER_NOTE,
                    data: { note: `Lines edited by staff: ${note}` },
                },
                false,
            );
            await this.editPorts.afterLinesEdited(txCtx, String(orderId));
            await this.orderChecks.run(txCtx, String(orderId), 'on-edit');
            this.eventBus.publish(new OrderLinesEditedEvent(txCtx, orderId, kind));
        });
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
