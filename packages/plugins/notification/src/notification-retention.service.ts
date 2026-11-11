import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { NotificationRetentionRuleService } from './notification-retention-rule.service';
import { resolveRetention } from './retention-rules';
import { loggerCtx } from './types';

const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 20;

@Injectable()
export class NotificationRetentionService {
    constructor(
        private connection: TransactionalConnection,
        private rules: NotificationRetentionRuleService,
    ) {}

    // Periods are read from the rule rows on every run; a type without its own days uses the default row.
    async deleteExpired(
        ctx: RequestContext,
        maxBatches: number = MAX_BATCHES_PER_RUN,
    ): Promise<number> {
        await this.rules.seedDefaults(ctx);
        await this.rules.discoverTypes(ctx);
        const retention = resolveRetention(await this.rules.loadRows(ctx));
        if (!retention) {
            Logger.error(
                'Notification retention has no usable default rule; nothing deleted',
                loggerCtx,
            );
            return 0;
        }
        let total = 0;
        for (let batch = 0; batch < maxBatches; batch++) {
            const rows = await ctxQuery<Array<{ n: number }>>(
                this.connection,
                ctx,
                `WITH d AS (
                     DELETE FROM notification WHERE id IN (
                         SELECT n.id FROM notification n
                         LEFT JOIN unnest($1::text[], $2::int[], $3::int[])
                             AS o("sourceType", "readDays", "unreadDays") ON o."sourceType" = n."sourceType"
                         WHERE (n.status <> 'unread' AND n."updatedAt" < now()
                                - make_interval(days => COALESCE(o."readDays", $4::int)))
                            OR (n.status = 'unread' AND n."updatedAt" < now()
                                - make_interval(days => COALESCE(o."unreadDays", $5::int)))
                         ORDER BY n."updatedAt" LIMIT ${BATCH_SIZE} FOR UPDATE OF n SKIP LOCKED
                     ) RETURNING 1)
                 SELECT count(*)::int AS n FROM d`,
                [
                    retention.sourceTypes,
                    retention.readDays,
                    retention.unreadDays,
                    retention.defaultReadDays,
                    retention.defaultUnreadDays,
                ],
            );
            const deleted = rows[0]?.n ?? 0;
            total += deleted;
            if (deleted < BATCH_SIZE) break;
        }
        return total;
    }
}
