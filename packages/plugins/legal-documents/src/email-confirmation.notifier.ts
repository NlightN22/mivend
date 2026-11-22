import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';

// The storefront shows its own ru/en text for this source type; the stored text is the English fallback.
export const EMAIL_CONFIRMATION_SOURCE = 'email-confirmation';

@Injectable()
export class EmailConfirmationNotifier {
    constructor(private notifications: NotificationService) {}

    async notify(ctx: RequestContext, customerId: number): Promise<void> {
        await this.notifications.create(ctx, {
            recipientType: 'customer',
            recipientId: String(customerId),
            kind: 'warning',
            sourceType: EMAIL_CONFIRMATION_SOURCE,
            sourceId: String(customerId),
            title: 'Confirm your new e-mail address',
            message:
                'Your e-mail address was changed. Follow the link we sent to it to confirm it.',
        });
    }

    async resolve(ctx: RequestContext, customerId: number): Promise<void> {
        await this.notifications.resolveBySource(
            ctx,
            { sourceType: EMAIL_CONFIRMATION_SOURCE, sourceId: String(customerId) },
            'confirmed',
        );
    }
}
