import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

const BATCH_SIZE = 1000;
const DAY_MS = 86_400_000;

export interface NotificationRetention {
    handledDays: number;
    unreadDays: number;
}

export function retentionFromEnv(env: NodeJS.ProcessEnv = process.env): NotificationRetention {
    return {
        handledDays: parseInt(env.NOTIFICATION_RETENTION_READ_DAYS ?? '90'),
        unreadDays: parseInt(env.NOTIFICATION_RETENTION_UNREAD_DAYS ?? '365'),
    };
}

@Injectable()
export class NotificationRetentionService {
    constructor(private connection: TransactionalConnection) {}

    async deleteExpired(
        ctx: RequestContext,
        retention: NotificationRetention = retentionFromEnv(),
        now: Date = new Date(),
    ): Promise<number> {
        const handledBefore = new Date(now.getTime() - retention.handledDays * DAY_MS);
        const unreadBefore = new Date(now.getTime() - retention.unreadDays * DAY_MS);
        let total = 0;
        for (;;) {
            const rows = await ctxQuery<Array<{ n: number }>>(
                this.connection,
                ctx,
                `WITH d AS (
                     DELETE FROM notification WHERE id IN (
                         SELECT id FROM notification
                         WHERE (status <> 'unread' AND "updatedAt" < $1)
                            OR (status = 'unread' AND "updatedAt" < $2)
                         ORDER BY "updatedAt" LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED
                     ) RETURNING 1)
                 SELECT count(*)::int AS n FROM d`,
                [handledBefore, unreadBefore],
            );
            const deleted = rows[0]?.n ?? 0;
            total += deleted;
            if (deleted < BATCH_SIZE) return total;
        }
    }
}
