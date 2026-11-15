import { RequestContext, VendureEvent } from '@vendure/core';

// One per committed change of a counterparty's portal-owned fields; the version is the counter after the change.
export class CounterpartyVersionedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly erpId: string,
        public readonly version: number,
    ) {
        super();
    }
}
