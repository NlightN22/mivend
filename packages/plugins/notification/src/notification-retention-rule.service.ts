import { randomUUID } from 'crypto';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    EntityNotFoundError,
    ListQueryBuilder,
    ListQueryOptions,
    Logger,
    PaginatedList,
    ProcessContext,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { ctxQuery } from 'shared';

import { NotificationRetentionRule } from './entities/notification-retention-rule.entity';
import {
    retentionProblems,
    SEED_RULES,
    type RetentionRuleRow,
    type RetentionRuleValues,
} from './retention-rules';
import { loggerCtx } from './types';

@Injectable()
export class NotificationRetentionRuleService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private processContext: ProcessContext,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.processContext.isWorker) return;
        try {
            await this.seedDefaults(RequestContext.empty());
        } catch (err) {
            Logger.error(
                `Failed to provision notification retention rules: ${err instanceof Error ? err.message : String(err)}`,
                loggerCtx,
            );
        }
    }

    // DO NOTHING on conflict: an existing row, edited by staff or not, is never overwritten.
    async seedDefaults(ctx: RequestContext): Promise<void> {
        await ctxQuery(
            this.connection,
            ctx,
            `INSERT INTO notification_retention_rule (uuid, "sourceType", "readDays", "unreadDays")
             SELECT * FROM unnest($1::uuid[], $2::text[], $3::int[], $4::int[])
             ON CONFLICT ("sourceType") DO NOTHING`,
            [
                SEED_RULES.map(() => randomUUID()),
                SEED_RULES.map(r => r.sourceType),
                SEED_RULES.map(r => r.readDays),
                SEED_RULES.map(r => r.unreadDays),
            ],
        );
    }

    // A source type becomes a rule row (inheriting the default) the first time the cleanup sees it.
    // Bounded to recent rows (indexed createdAt) so the hourly run never scans the whole table.
    async discoverTypes(ctx: RequestContext): Promise<void> {
        await ctxQuery(
            this.connection,
            ctx,
            `INSERT INTO notification_retention_rule (uuid, "sourceType")
             SELECT gen_random_uuid(), s."sourceType" FROM (SELECT DISTINCT "sourceType" FROM notification
                   WHERE "createdAt" > now() - interval '2 days') s
             ON CONFLICT ("sourceType") DO NOTHING`,
        );
    }

    loadRows(ctx: RequestContext): Promise<RetentionRuleRow[]> {
        return ctxQuery<RetentionRuleRow[]>(
            this.connection,
            ctx,
            `SELECT "sourceType", "readDays", "unreadDays" FROM notification_retention_rule`,
        );
    }

    findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<NotificationRetentionRule>,
    ): Promise<PaginatedList<NotificationRetentionRule>> {
        return this.listQueryBuilder
            .build(NotificationRetentionRule, options, { ctx, orderBy: { sourceType: 'ASC' } })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    async update(
        ctx: RequestContext,
        id: ID,
        input: RetentionRuleValues,
    ): Promise<NotificationRetentionRule> {
        const repo = this.connection.getRepository(ctx, NotificationRetentionRule);
        const row = await repo.findOne({ where: { id } });
        if (!row) throw new EntityNotFoundError('NotificationRetentionRule', id);
        const values = { readDays: input.readDays ?? null, unreadDays: input.unreadDays ?? null };
        const problems = retentionProblems(row.sourceType, values);
        if (problems.length > 0) throw new UserInputError(problems.join('; '));
        row.readDays = values.readDays;
        row.unreadDays = values.unreadDays;
        return repo.save(row);
    }
}
