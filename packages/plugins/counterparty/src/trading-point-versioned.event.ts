import { RequestContext, VendureEvent } from '@vendure/core';

// One per committed change of a trading point record; the version is the per-point counter after the change.
export class TradingPointVersionedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly tradingPointUuid: string,
        public readonly version: number,
    ) {
        super();
    }
}
