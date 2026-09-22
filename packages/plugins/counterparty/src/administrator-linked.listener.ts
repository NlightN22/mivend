import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { AdministratorLinkedEvent } from '@mivend/plugin-access-control';
import { subscribeAndLog } from 'shared';

import { CounterpartyService } from './counterparty.service';

const loggerCtx = 'AdministratorLinkedListener';

// mivend.audit.common (2026-09-20): a Counterparty whose `counterparty` event arrived while its
// manager's erpId was still `unlinked` gets saved with assignedManagerId=null and no retry (see
// CounterpartyStreamHandler.resolveAssignedManagerId) — nothing else would ever revisit it once
// that erpId finally links, unless ERP happens to send another counterparty update. This listener
// is that missing revisit, triggered the moment the link actually happens.
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
