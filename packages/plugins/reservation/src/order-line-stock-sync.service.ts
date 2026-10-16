import { Injectable } from '@nestjs/common';
import {
    Order,
    OrderLine,
    RequestContext,
    StockMovementService,
    TransactionalConnection,
} from '@vendure/core';

// Keeps Vendure's own allocation (stock_movement, StockLevel.stockAllocated) in step with a staff edit of a
// placed order: the edit writes lines directly, so Vendure's order-modification hooks never run (#233).
@Injectable()
export class OrderLineStockSyncService {
    constructor(
        private connection: TransactionalConnection,
        private stockMovement: StockMovementService,
    ) {}

    async changeQuantity(
        ctx: RequestContext,
        order: Order,
        line: OrderLine,
        delta: number,
    ): Promise<void> {
        if (delta === 0 || !this.isAllocated(order)) return;
        const lines = [{ orderLineId: line.id, quantity: Math.abs(delta) }];
        if (delta > 0) await this.stockMovement.createAllocationsForOrderLines(ctx, lines);
        else await this.stockMovement.createReleasesForOrderLines(ctx, lines);
    }

    // A line with stock movements cannot be deleted (foreign key); once the allocation is released its
    // movements net to zero, so they are dropped with it.
    async removeLine(ctx: RequestContext, order: Order, line: OrderLine): Promise<void> {
        await this.changeQuantity(ctx, order, line, -line.quantity);
        await this.connection
            .getRepository(ctx, OrderLine)
            .query(`DELETE FROM stock_movement WHERE "orderLineId" = $1`, [line.id]);
        await this.connection.getRepository(ctx, OrderLine).remove(line);
    }

    private isAllocated(order: Order): boolean {
        return !order.active && order.state !== 'Draft';
    }
}
