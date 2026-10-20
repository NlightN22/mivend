import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, RequestContextService } from '@vendure/core';
import { subscribeAndLog } from 'shared';

import { BranchAssignmentRetryEvent } from './branch-assignment-retry.event';
import { BranchAssignmentService } from './branch-assignment.service';

const RETRY_DELAY_MS = 500;

// Bounded: the service stops publishing after its attempt limit, so this never loops forever.
@Injectable()
export class BranchAssignmentRetryListener implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private service: BranchAssignmentService,
        private requestContextService: RequestContextService,
    ) {}

    onApplicationBootstrap(): void {
        subscribeAndLog(
            this.eventBus,
            BranchAssignmentRetryEvent,
            event => this.handle(event),
            'BranchAssignmentRetryListener',
        );
    }

    private async handle(event: BranchAssignmentRetryEvent): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * event.attempt));
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        await this.service.retrySkipped(ctx, event.skipped, event.attempt);
    }
}
