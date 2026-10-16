import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    ProformaInvoice,
    ProformaInvoiceIssuedEvent,
    ProformaInvoiceIssuingService,
} from '@mivend/plugin-acquiring';
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
        private readonly eventBus: EventBus,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register(this);
    }

    async afterLinesEdited(ctx: RequestContext, orderId: string): Promise<void> {
        const existing = await this.connection
            .getRepository(ctx, ProformaInvoice)
            .count({ where: { orderId: Number(orderId) } });
        if (existing === 0) return;
        const { created } = await this.issuing.issueForOrder(ctx, orderId);
        for (const invoice of created) {
            await this.eventBus.publish(new ProformaInvoiceIssuedEvent(ctx, invoice));
        }
    }
}
