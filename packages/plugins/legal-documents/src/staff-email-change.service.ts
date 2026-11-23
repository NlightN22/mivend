import { Injectable } from '@nestjs/common';
import {
    Customer,
    CustomerService,
    EventBus,
    RequestContext,
    TransactionalConnection,
    UserService,
} from '@vendure/core';

import { maskEmail } from './mask-email';
import { EmailConfirmationNotifier } from './email-confirmation.notifier';
import { EmailConfirmationService, normalizeEmail } from './email-confirmation.service';
import type { ResendResult } from './email-confirmation.service';
import { EmailChangeRequestedEvent } from './events/email-change-requested.event';
import { EmailConfirmationRequestedEvent } from './events/email-confirmation-requested.event';

export type StagedChange = 'apply' | 'staged' | 'unchanged';

// A staff-set address stays pending until the customer follows the link; the old one stays active.
@Injectable()
export class StaffEmailChangeService {
    constructor(
        private customers: CustomerService,
        private users: UserService,
        private connection: TransactionalConnection,
        private confirmations: EmailConfirmationService,
        private notifier: EmailConfirmationNotifier,
        private events: EventBus,
    ) {}

    // 'apply' leaves the input to core: no sign-in to protect, or a clash core reports itself.
    async classify(ctx: RequestContext, id: number, email: string): Promise<StagedChange> {
        const customer = await this.customers.findOne(ctx, id, ['user']);
        const address = normalizeEmail(email);
        if (!customer || !address) return 'apply';
        if (address === normalizeEmail(customer.emailAddress)) return 'unchanged';
        if (!customer.user) return 'apply';
        const other = await this.connection
            .getRepository(ctx, Customer)
            .createQueryBuilder('c')
            .where('c.id != :id', { id })
            .andWhere('c.deletedAt IS NULL')
            .andWhere('lower(trim(c.emailAddress)) = :address', { address })
            .getOne();
        const user = await this.users.getUserByEmailAddress(ctx, address, 'customer');
        return other || (user && user.id !== customer.user.id) ? 'apply' : 'staged';
    }

    async stage(ctx: RequestContext, id: number, email: string): Promise<void> {
        const customer = await this.customers.findOne(ctx, id, ['user']);
        const address = normalizeEmail(email);
        if (!customer?.user || !address) return;
        const token = await this.confirmations.requestConfirmation(ctx, id, address);
        if (!token) return;
        await this.notifier.notify(ctx, id);
        await this.events.publish(
            new EmailConfirmationRequestedEvent(ctx, customer.user, address, token),
        );
        await this.events.publish(
            new EmailChangeRequestedEvent(
                ctx,
                customer.user,
                customer.emailAddress,
                maskEmail(address),
            ),
        );
    }

    async resend(ctx: RequestContext, id: number): Promise<ResendResult> {
        const customer = await this.customers.findOne(ctx, id, ['user']);
        if (!customer?.user) return { status: 'none' };
        const result = await this.confirmations.resend(ctx, id);
        if (result.status !== 'sent') return result;
        await this.notifier.notify(ctx, id);
        await this.events.publish(
            new EmailConfirmationRequestedEvent(ctx, customer.user, result.address, result.token),
        );
        return result;
    }

    async cancel(ctx: RequestContext, id: number): Promise<void> {
        if (await this.confirmations.clearPending(ctx, id)) await this.notifier.resolve(ctx, id);
    }
}
