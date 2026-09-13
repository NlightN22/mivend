import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { AdministratorService, CustomerService, RequestContext } from '@vendure/core';

import type { NotificationRecipientType } from './entities/notification.entity';

export interface NotificationRecipient {
    recipientType: NotificationRecipientType;
    recipientId: string;
}

// Resolves "who is calling" from ctx.activeUserId — mirrors the pattern already used by
// plugin-acquiring's PaymentShopResolver.getOwnCounterparty (Customer side) and
// plugin-access-control/plugin-saved-views's own AdministratorService.findOneByUserId lookups
// (Administrator side). Never trusts a client-supplied recipientId.
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

    // Split out from getCurrentAdministrator/getCurrentCustomer for the WS subscription context
    // (apps/server/src/subscriptions.ts), which resolves a user id from a session token directly
    // rather than from ctx.activeUserId (no HTTP AuthGuard runs on that path — see that file's
    // own comment).
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
