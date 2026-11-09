import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import type { FieldChanges } from './change-journal.types';

export interface ChangeJournalEntryView {
    id: string;
    occurredAt: Date;
    actorType: string;
    userId: string | null;
    administratorId: string | null;
    source: string;
    requestId: string | null;
    sessionId: string | null;
    entityType: string;
    entityId: string;
    entityUuid: string | null;
    action: string;
    changes: FieldChanges;
}

export interface ChangeJournalPage {
    items: ChangeJournalEntryView[];
    totalItems: number;
}

export interface ChangeJournalFilter {
    entityType?: string | null;
    actorType?: string | null;
    userId?: string | null;
    administratorId?: string | null;
    occurredAfter?: Date | null;
    occurredBefore?: Date | null;
}

export interface PageArgs {
    skip?: number | null;
    take?: number | null;
}

export const MAX_TAKE = 100;

const COLUMNS = `id::text AS id, "occurredAt", "actorType", "userId", "administratorId", "source",
    "requestId", "sessionId", "entityType", "entityId", "entityUuid", "action", "changes"`;

@Injectable()
export class ChangeJournalService {
    constructor(private connection: TransactionalConnection) {}

    findForEntity(
        ctx: RequestContext,
        entityType: string,
        entityId: string,
        page: PageArgs,
    ): Promise<ChangeJournalPage> {
        return this.page(
            ctx,
            ['"entityType" = $1', '"entityId" = $2'],
            [entityType, entityId],
            page,
        );
    }

    findFiltered(
        ctx: RequestContext,
        filter: ChangeJournalFilter,
        page: PageArgs,
    ): Promise<ChangeJournalPage> {
        const where: string[] = [];
        const params: unknown[] = [];
        const add = (sql: string, value: unknown): void => {
            if (value === undefined || value === null || value === '') return;
            params.push(value);
            where.push(sql.replace('?', `$${params.length}`));
        };
        add('"entityType" = ?', filter.entityType);
        add('"actorType" = ?', filter.actorType);
        add('"userId" = ?', filter.userId != null ? String(filter.userId) : null);
        add(
            '"administratorId" = ?',
            filter.administratorId != null ? String(filter.administratorId) : null,
        );
        add('"occurredAt" >= ?', filter.occurredAfter);
        add('"occurredAt" < ?', filter.occurredBefore);
        return this.page(ctx, where, params, page);
    }

    // One bounded statement per batch; SKIP LOCKED lets concurrent sweeps split the work.
    async deleteOlderThan(ctx: RequestContext, cutoff: Date, batchSize: number): Promise<number> {
        const rows = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `WITH doomed AS (
                SELECT id FROM "change_journal_entry" WHERE "occurredAt" < $1
                ORDER BY "occurredAt" LIMIT $2 FOR UPDATE SKIP LOCKED
             ), d AS (DELETE FROM "change_journal_entry" e USING doomed WHERE e.id = doomed.id RETURNING 1)
             SELECT count(*)::int AS n FROM d`,
            [cutoff, batchSize],
        );
        return rows[0]?.n ?? 0;
    }

    private async page(
        ctx: RequestContext,
        where: string[],
        params: unknown[],
        page: PageArgs,
    ): Promise<ChangeJournalPage> {
        const take = Math.min(Math.max(page.take ?? 20, 0), MAX_TAKE);
        const skip = Math.max(page.skip ?? 0, 0);
        const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const n = params.length;
        const items =
            take === 0
                ? []
                : await ctxQuery<ChangeJournalEntryView[]>(
                      this.connection,
                      ctx,
                      `SELECT ${COLUMNS} FROM "change_journal_entry" ${clause}
                       ORDER BY "occurredAt" DESC, id DESC LIMIT $${n + 1} OFFSET $${n + 2}`,
                      [...params, take, skip],
                  );
        const count = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `SELECT count(*)::int AS n FROM "change_journal_entry" ${clause}`,
            params,
        );
        return { items, totalItems: count[0]?.n ?? 0 };
    }
}
