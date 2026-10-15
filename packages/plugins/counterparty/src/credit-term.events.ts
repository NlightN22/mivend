import { RequestContext, VendureEvent } from '@vendure/core';

// Only plugin-sync may touch RabbitMQ/the ERP adapter; it subscribes and pushes via outbox.
// Not wired yet; ERP sync can subscribe later without changes here (same as OrderReadyForErpEvent).
export class CreditTermApprovedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly counterpartyId: string,
        public readonly extraDays: number,
        public readonly approvalRequestId: string,
    ) {
        super();
    }
}
