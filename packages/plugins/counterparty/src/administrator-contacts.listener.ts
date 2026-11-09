import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { AdministratorLinkedEvent, ErpUserService } from '@mivend/plugin-access-control';
import { subscribeAndLog } from 'shared';

import { ContactPointService } from './contact-point.service';
import type { ContactPointInput } from './contact-point-normalize';

const loggerCtx = 'AdministratorContactsListener';

// A user event that arrived before its administrator linked kept its contact list on the ERP user row.
@Injectable()
export class AdministratorContactsListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly erpUsers: ErpUserService,
        private readonly contactPoints: ContactPointService,
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
        const stored = (await this.erpUsers.findByErpId(event.ctx, event.erpId))?.contactInfos;
        if (!stored) return;
        const inputs = JSON.parse(stored) as ContactPointInput[];
        await this.contactPoints.replaceErpPoints(
            event.ctx,
            'administrator',
            Number(event.administratorId),
            inputs,
        );
    }
}
