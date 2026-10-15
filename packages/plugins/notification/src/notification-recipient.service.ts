import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { AdministratorService, CustomerService, RequestContext } from '@vendure/core';

import type { NotificationRecipientType } from './entities/notification.entity';

export interface NotificationRecipient {
    recipientType: NotificationRecipientType;
    recipientId: string;
}

// Caller identity comes from ctx.activeUserId; never trust a client-supplied recipientId.
@Injectable()
export class NotificationRecipientService {
    constructor(
        private administratorService: AdministratorService,
        private customerService: CustomerService,
    ) {}

    async getCurrentAdministrator(ctx: RequestContext): Promise<NotificationRecipient | null> {
        if (!ctx.activeUserId) return null;
        return this.getCurrentAdministratorByUserId(ctx, ctx.activeUserId);
    }

    async getCurrentCustomer(ctx: RequestContext): Promise<NotificationRecipient | null> {
        if (!ctx.activeUserId) return null;
        return this.getCurrentCustomerByUserId(ctx, ctx.activeUserId);
    }

    // Used by WS subscriptions, where no HTTP AuthGuard runs, so ctx.activeUserId is unset.
    // The user id must come from the session token instead.
    async getCurrentAdministratorByUserId(
        ctx: RequestContext,
        userId: ID,
    ): Promise<NotificationRecipient | null> {
        const admin = await this.administratorService.findOneByUserId(ctx, userId);
        return admin ? { recipientType: 'administrator', recipientId: String(admin.id) } : null;
    }

    async getCurrentCustomerByUserId(
        ctx: RequestContext,
        userId: ID,
    ): Promise<NotificationRecipient | null> {
        const customer = await this.customerService.findOneByUserId(ctx, userId);
        return customer ? { recipientType: 'customer', recipientId: String(customer.id) } : null;
    }
}
