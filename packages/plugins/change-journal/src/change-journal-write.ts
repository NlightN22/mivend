import { randomUUID } from 'node:crypto';

import type { ChangeJournalRecord } from './change-journal.types';

export interface SqlRunner {
    query(sql: string, params?: unknown[]): Promise<unknown>;
}

export async function insertJournalEntry(runner: SqlRunner, r: ChangeJournalRecord): Promise<void> {
    await runner.query(
        `INSERT INTO "change_journal_entry" ("uuid", "occurredAt", "actorType", "userId", "administratorId",
            "source", "requestId", "sessionId", "entityType", "entityId", "entityUuid", "action", "changes")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
            randomUUID(),
            r.occurredAt,
            r.actorType,
            r.userId,
            r.administratorId,
            r.source,
            r.requestId,
            r.sessionId,
            r.entityType,
            r.entityId,
            r.entityUuid,
            r.action,
            JSON.stringify(r.changes),
        ],
    );
}
