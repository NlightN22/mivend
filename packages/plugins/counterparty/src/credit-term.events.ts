import { RequestContext, VendureEvent } from '@vendure/core';

// Published once an approved creditTermApproval(Escalated) request has been applied to
// Counterparty.creditTermOverrideExtraDays. plugin-sync (the only plugin allowed to touch
// RabbitMQ/the ERP adapter, per AGENTS.md's "Inter-plugin communication" rule) can subscribe
// to this and push the extension to 1C via the outbox — not wired yet, this event exists so
// that integration can be added without any change here, same pattern as
// OrderReadyForErpEvent in plugin-erp-order.
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
