import { Injectable } from '@nestjs/common';
import {
    Order,
    OrderLine,
    RequestContext,
    StockMovementService,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

interface LineAllocation {
    allocated: boolean;
    net: number;
}

// Keeps Vendure's own allocation (stock_movement, StockLevel.stockAllocated) in step with a staff edit of a
// placed order: the edit writes lines directly, so Vendure's order-modification hooks never run (#233).
// Whether a line is allocated is read from its own movement rows, never guessed from the order state.
// Verified against @vendure/core 3.7.3 StockMovementService: ALLOCATION and RELEASE rows store a positive
// quantity (stockAllocated +q / -q), SALE stores -q and takes q out of stockAllocated AND stockOnHand.
@Injectable()
export class OrderLineStockSyncService {
    constructor(
        private connection: TransactionalConnection,
        private stockMovement: StockMovementService,
    ) {}

    async changeQuantity(
        ctx: RequestContext,
        _order: Order,
        line: OrderLine,
        delta: number,
    ): Promise<void> {
        if (delta === 0) return;
        const current = await this.allocationOf(ctx, line.id);
        if (!current.allocated) return;
        if (delta > 0) {
            await this.stockMovement.createAllocationsForOrderLines(ctx, [
                { orderLineId: line.id, quantity: delta },
            ]);
            return;
        }
        const release = Math.min(-delta, current.net);
        if (release > 0) await this.release(ctx, line, release);
    }

    // A line with stock movements cannot be deleted (foreign key); once the allocation is released its
    // allocation and release rows net to zero, so they are dropped with it.
    async removeLine(ctx: RequestContext, _order: Order, line: OrderLine): Promise<void> {
        const { net } = await this.allocationOf(ctx, line.id);
        if (net > 0) await this.release(ctx, line, net);
        const repo = this.connection.getRepository(ctx, OrderLine);
        await repo.query(
            `DELETE FROM stock_movement WHERE "orderLineId" = $1 AND type IN ('ALLOCATION', 'RELEASE')`,
            [line.id],
        );
        await repo.remove(line);
    }

    private async release(ctx: RequestContext, line: OrderLine, quantity: number): Promise<void> {
        await this.stockMovement.createReleasesForOrderLines(ctx, [
            { orderLineId: line.id, quantity },
        ]);
    }

    private async allocationOf(ctx: RequestContext, lineId: unknown): Promise<LineAllocation> {
        const rows: Array<{ type: string; total: string; locations: string }> =
            await this.connection.getRepository(ctx, OrderLine).query(
                `SELECT type, COALESCE(SUM(quantity), 0) AS total,
                        COUNT(DISTINCT "stockLocationId") AS locations FROM stock_movement
                  WHERE "orderLineId" = $1 AND type IN ('ALLOCATION', 'RELEASE', 'SALE') GROUP BY type`,
                [lineId],
            );
        // Vendure stores a RELEASE row's full quantity once per location, so a split line would be miscounted: refuse.
        if (rows.some(r => Number(r.locations) > 1)) {
            throw new UserInputError(
                'The line is allocated across several stock locations; adjust it in the ERP flow instead',
            );
        }
        const sum = (type: string): number => Number(rows.find(r => r.type === type)?.total ?? 0);
        return {
            allocated: rows.some(r => r.type === 'ALLOCATION'),
            net: sum('ALLOCATION') - sum('RELEASE') + sum('SALE'),
        };
    }
}
