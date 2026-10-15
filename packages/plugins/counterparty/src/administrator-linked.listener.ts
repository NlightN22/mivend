import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { AdministratorLinkedEvent } from '@mivend/plugin-access-control';
import { subscribeAndLog } from 'shared';

import { CounterpartyService } from './counterparty.service';

const loggerCtx = 'AdministratorLinkedListener';

// Counterparties saved before the manager's erpId links get no retry, so nothing else revisits them;
// This listener is the only revisit, fired when the erpId link happens.
@Injectable()
export class AdministratorLinkedListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly counterpartyService: CounterpartyService,
    ) {}

    onApplicationBootstrap(): void {
        subscribeAndLog(
            this.eventBus,
            AdministratorLinkedEvent,
            event => this.handle(event),
            loggerCtx,
        );
    }

    private async handle(event: AdministratorLinkedEvent): Promise<void> {
        await this.counterpartyService.backfillAssignedManager(
            event.ctx,
            event.erpId,
            event.administratorId,
        );
    }
}
