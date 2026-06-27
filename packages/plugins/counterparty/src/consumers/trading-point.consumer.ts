import { Injectable } from '@nestjs/common';
import { Logger, RequestContext } from '@vendure/core';

import { TradingPointService, TradingPointUpsertPayload } from '../trading-point.service';
import { loggerCtx } from '../types';

export interface TradingPointUpsertEvent {
    eventType: 'trading_point.upsert';
    eventId: string;
    payload: TradingPointUpsertPayload;
}

export interface TradingPointDeactivateEvent {
    eventType: 'trading_point.deactivate';
    eventId: string;
    payload: { erpId: string };
}

export type TradingPointEvent = TradingPointUpsertEvent | TradingPointDeactivateEvent;

@Injectable()
export class TradingPointConsumer {
    constructor(private readonly tradingPointService: TradingPointService) {}

    async handleEvent(event: TradingPointEvent): Promise<void> {
        const ctx = RequestContext.empty();
        switch (event.eventType) {
            case 'trading_point.upsert':
                await this.tradingPointService.upsert(ctx, event.payload);
                Logger.verbose(`Handled trading_point.upsert [${event.payload.erpId}]`, loggerCtx);
                break;
            case 'trading_point.deactivate':
                await this.tradingPointService.deactivate(ctx, event.payload.erpId);
                Logger.verbose(
                    `Handled trading_point.deactivate [${event.payload.erpId}]`,
                    loggerCtx,
                );
                break;
        }
    }
}
