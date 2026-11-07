import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

const BATCH_SIZE = 1000;

export interface NotificationRetention {
    handledDays: number;
    unreadDays: number;
}

function positiveDays(raw: string | undefined, fallback: number): number {
    const days = parseInt(raw ?? '');
    return days > 0 ? days : fallback;
}

export function retentionFromEnv(env: NodeJS.ProcessEnv = process.env): NotificationRetention {
    return {
        handledDays: positiveDays(env.NOTIFICATION_RETENTION_READ_DAYS, 90),
        unreadDays: positiveDays(env.NOTIFICATION_RETENTION_UNREAD_DAYS, 365),
    };
}

@Injectable()
export class NotificationRetentionService {
    constructor(private connection: TransactionalConnection) {}

    async deleteExpired(
        ctx: RequestContext,
        retention: NotificationRetention = retentionFromEnv(),
    ): Promise<number> {
        let total = 0;
        for (;;) {
            const rows = await ctxQuery<Array<{ n: number }>>(
                this.connection,
                ctx,
                `WITH d AS (
                     DELETE FROM notification WHERE id IN (
                         SELECT id FROM notification
                         WHERE (status <> 'unread' AND "updatedAt" < now() - make_interval(days => $1))
                            OR (status = 'unread' AND "updatedAt" < now() - make_interval(days => $2))
                         ORDER BY "updatedAt" LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED
                     ) RETURNING 1)
                 SELECT count(*)::int AS n FROM d`,
                [retention.handledDays, retention.unreadDays],
            );
            const deleted = rows[0]?.n ?? 0;
            total += deleted;
            if (deleted < BATCH_SIZE) return total;
        }
    }
}
