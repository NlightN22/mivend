import { RequestContext, VendureEvent } from '@vendure/core';

export class CounterpartyCreatedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly counterpartyId: string,
        public readonly erpId: string,
    ) {
        super();
    }
}
