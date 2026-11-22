import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    AccountVerifiedEvent,
    CustomerEvent,
    CustomerService,
    EventBus,
    IdentifierChangeEvent,
    RequestContext,
} from '@vendure/core';

import { subscribeAndLog } from 'shared';

import { EmailConfirmationNotifier } from './email-confirmation.notifier';
import { EmailConfirmationService } from './email-confirmation.service';

// The customer's own flows (verification, own address change, import) record the address as confirmed.
@Injectable()
export class EmailConfirmationListener implements OnApplicationBootstrap {
    constructor(
        private events: EventBus,
        private customers: CustomerService,
        private confirmations: EmailConfirmationService,
        private notifier: EmailConfirmationNotifier,
    ) {}

    onApplicationBootstrap(): void {
        const log = 'EmailConfirmation';
        subscribeAndLog(
            this.events,
            AccountVerifiedEvent,
            e => this.confirm(e.ctx, e.customer.id),
            log,
        );
        subscribeAndLog(
            this.events,
            IdentifierChangeEvent,
            async e => {
                const customer = await this.customers.findOneByUserId(e.ctx, e.user.id);
                if (customer) await this.confirm(e.ctx, customer.id);
            },
            log,
        );
        subscribeAndLog(
            this.events,
            CustomerEvent,
            async e => {
                if (e.type === 'created') await this.confirmIfVerified(e.ctx, e.entity.id);
            },
            log,
        );
    }

    private async confirm(ctx: RequestContext, id: number | string): Promise<void> {
        const customer = await this.customers.findOne(ctx, id);
        if (!customer) return;
        await this.confirmations.markConfirmed(ctx, Number(id), customer.emailAddress);
        await this.notifier.resolve(ctx, Number(id));
    }

    private async confirmIfVerified(ctx: RequestContext, id: number | string): Promise<void> {
        const customer = await this.customers.findOne(ctx, id, ['user']);
        if (customer?.user?.verified) await this.confirm(ctx, id);
    }
}
