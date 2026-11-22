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
import { EmailConfirmationRequestedEvent } from './events/email-confirmation-requested.event';

// Staff changes the address: not confirmed until the customer follows the link; the customer's own flows confirm it.
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
                const input = e.input as { emailAddress?: string } | undefined;
                if (e.type === 'created') await this.confirmIfVerified(e.ctx, e.entity.id);
                else if (e.type === 'updated' && input?.emailAddress)
                    await this.request(e.ctx, e.entity.id);
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

    async request(ctx: RequestContext, id: number | string): Promise<void> {
        const customer = await this.customers.findOne(ctx, id, ['user']);
        if (!customer?.user) return;
        const token = await this.confirmations.requestConfirmation(
            ctx,
            Number(id),
            customer.emailAddress,
        );
        if (token) {
            await this.notifier.notify(ctx, Number(id));
            await this.events.publish(
                new EmailConfirmationRequestedEvent(
                    ctx,
                    customer.user,
                    customer.emailAddress,
                    token,
                ),
            );
        }
    }
}
