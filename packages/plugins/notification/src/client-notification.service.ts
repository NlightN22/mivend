import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { withAggregateLock } from 'shared';
import type { SelectQueryBuilder } from 'typeorm';

import {
    CLIENT_SOURCE_TYPE,
    DEDUPE_WINDOW_SECONDS,
    RATE_LIMIT_PER_WINDOW,
    RATE_WINDOW_SECONDS,
    normalizeClientNotification,
    type ClientNotificationInput,
} from './client-notification-rules';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import type { NotificationRecipient } from './notification-recipient.service';

// Persists a notification a portal shows as a popup (#348). The recipient is always the caller.
@Injectable()
export class ClientNotificationService {
    constructor(
        private connection: TransactionalConnection,
        private notificationService: NotificationService,
    ) {}

    // The lock serializes one recipient's writes, so the duplicate check and the rate count read
    // under it: two identical concurrent calls store one row (docs/concurrency.md).
    async record(
        ctx: RequestContext,
        recipient: NotificationRecipient,
        raw: ClientNotificationInput,
    ): Promise<Notification> {
        const input = normalizeClientNotification(raw);
        const key = `client-notification:${recipient.recipientType}:${recipient.recipientId}`;
        return withAggregateLock(this.connection, ctx, key, async txCtx => {
            const own = (windowSeconds: number): SelectQueryBuilder<Notification> =>
                this.connection
                    .getRepository(txCtx, Notification)
                    .createQueryBuilder('n')
                    .where('n.recipientType = :type AND n.recipientId = :id', {
                        type: recipient.recipientType,
                        id: recipient.recipientId,
                    })
                    .andWhere('n.sourceType = :source', { source: CLIENT_SOURCE_TYPE })
                    .andWhere(`n."createdAt" > now() - make_interval(secs => :secs)`, {
                        secs: windowSeconds,
                    });

            const duplicate = await own(DEDUPE_WINDOW_SECONDS)
                .andWhere('n.kind = :kind AND n.title = :title AND n.message = :message', input)
                .orderBy('n.createdAt', 'DESC')
                .getOne();
            if (duplicate) return duplicate;

            if ((await own(RATE_WINDOW_SECONDS).getCount()) >= RATE_LIMIT_PER_WINDOW)
                throw new UserInputError('Too many notifications, try again in a minute');

            return this.notificationService.create(txCtx, {
                recipientType: recipient.recipientType,
                recipientId: recipient.recipientId,
                sourceType: CLIENT_SOURCE_TYPE,
                ...input,
            });
        });
    }
}
