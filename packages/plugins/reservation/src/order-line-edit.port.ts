import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';

// What an order-line edit needs from plugins that depend on this one (proforma invoices live in
// acquiring, which erp-integration adapts here); called inside the edit transaction, after the lines changed.
export interface OrderLinesEditPort {
    afterLinesEdited(ctx: RequestContext, orderId: string): Promise<void>;
}

@Injectable()
export class OrderLinesEditPortRegistry {
    private ports: OrderLinesEditPort[] = [];

    register(port: OrderLinesEditPort): void {
        this.ports.push(port);
    }

    async afterLinesEdited(ctx: RequestContext, orderId: string): Promise<void> {
        for (const port of this.ports) await port.afterLinesEdited(ctx, orderId);
    }
}
