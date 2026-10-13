import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { subscribeAndLog } from 'shared';
import { CounterpartyCreatedEvent } from '@mivend/plugin-counterparty';

import { SettlementPendingService } from './settlement-pending.service';

const listenerCtx = 'SettlementCounterpartyListener';

@Injectable()
export class SettlementCounterpartyListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly pending: SettlementPendingService,
    ) {}

    onApplicationBootstrap(): void {
        subscribeAndLog(
            this.eventBus,
            CounterpartyCreatedEvent,
            async event => {
                await this.pending.attachCounterparty(event.ctx, event.erpId, event.counterpartyId);
            },
            listenerCtx,
        );
    }
}
