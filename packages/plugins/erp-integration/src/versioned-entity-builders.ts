import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';

import { CounterpartyCommandBuilder } from './counterparty-command.builder';
import type { OutboundBuildResult } from './outbound-gateway';
import { TradingPointCommandBuilder } from './trading-point-command.builder';
import type { VersionedEventType } from './versioned-entities';

export interface VersionedEntityBuilder {
    build(ctx: RequestContext, key: string): Promise<OutboundBuildResult>;
}

// Which builder reads the current record for each registered versioned type.
@Injectable()
export class VersionedEntityBuilders {
    private readonly byType: Record<VersionedEventType, VersionedEntityBuilder>;

    constructor(
        tradingPoint: TradingPointCommandBuilder,
        counterparty: CounterpartyCommandBuilder,
    ) {
        this.byType = {
            'trading-point.changed': tradingPoint,
            'counterparty.changed': counterparty,
        };
    }

    get(eventType: VersionedEventType): VersionedEntityBuilder {
        return this.byType[eventType];
    }
}
