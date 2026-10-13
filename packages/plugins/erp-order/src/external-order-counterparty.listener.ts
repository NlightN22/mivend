import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { subscribeAndLog } from 'shared';
import { CounterpartyCreatedEvent } from '@mivend/plugin-counterparty';

import { ExternalOrderService } from './external-order.service';

const loggerCtx = 'ExternalOrderCounterpartyListener';

// External orders imported before their counterparty existed wait with the raw ERP id.
@Injectable()
export class ExternalOrderCounterpartyListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly externalOrderService: ExternalOrderService,
    ) {}

    onApplicationBootstrap(): void {
        subscribeAndLog(
            this.eventBus,
            CounterpartyCreatedEvent,
            async event => {
                await this.externalOrderService.attachCounterparty(
                    event.ctx,
                    event.erpId,
                    event.counterpartyId,
                );
            },
            loggerCtx,
        );
    }
}
