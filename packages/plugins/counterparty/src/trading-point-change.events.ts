import { RequestContext, VendureEvent } from '@vendure/core';

// Idempotency for the ERP side is the point uuid plus version; the ERP publisher subscribes to this.
export class TradingPointChangeAcceptedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly tradingPointUuid: string,
        public readonly changeUuid: string,
        public readonly version: number,
    ) {
        super();
    }
}
