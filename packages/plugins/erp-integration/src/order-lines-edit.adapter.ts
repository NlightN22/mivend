import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ProformaInvoice, ProformaInvoiceIssuingService } from '@mivend/plugin-acquiring';
import { OrderLinesEditPortRegistry } from '@mivend/plugin-reservation';
import type { OrderLinesEditPort } from '@mivend/plugin-reservation';

// A staff edit of an order's lines versions its existing proforma invoices (docs/payments.md); an
// order that has none yet gets none. Runs in the edit transaction under the order lock.
@Injectable()
export class OrderLinesEditAdapter implements OrderLinesEditPort, OnApplicationBootstrap {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly issuing: ProformaInvoiceIssuingService,
        private readonly registry: OrderLinesEditPortRegistry,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register(this);
    }

    async afterLinesEdited(ctx: RequestContext, orderId: string): Promise<void> {
        const existing = await this.connection
            .getRepository(ctx, ProformaInvoice)
            .count({ where: { orderId: Number(orderId) } });
        if (existing > 0) await this.issuing.issueForOrder(ctx, orderId);
    }
}
