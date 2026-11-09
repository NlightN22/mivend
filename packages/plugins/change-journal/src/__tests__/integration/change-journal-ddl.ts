// Same DDL as apps/server's 1791575000000-change-journal migration (the parity test guards that one).
export const CHANGE_JOURNAL_DDL = `
    CREATE TABLE "change_journal_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "id" SERIAL NOT NULL PRIMARY KEY, "uuid" uuid NOT NULL UNIQUE, "occurredAt" TIMESTAMP NOT NULL,
        "actorType" character varying NOT NULL, "userId" character varying, "administratorId" character varying,
        "source" character varying NOT NULL, "requestId" character varying, "sessionId" character varying,
        "entityType" character varying NOT NULL, "entityId" character varying NOT NULL, "entityUuid" character varying,
        "action" character varying NOT NULL, "changes" jsonb NOT NULL);
    CREATE INDEX "IDX_change_journal_entry_occurred_at" ON "change_journal_entry" ("occurredAt");
    CREATE INDEX "IDX_change_journal_entry_entity" ON "change_journal_entry" ("entityType", "entityId", "occurredAt");
`;
