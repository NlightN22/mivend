import { MigrationInterface, QueryRunner } from 'typeorm';

// #323: the change journal, one row per insert/update/remove of a journaled entity.
export class ChangeJournal1791574000000 implements MigrationInterface {
    name = 'ChangeJournal1791574000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "change_journal_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "occurredAt" TIMESTAMP NOT NULL, "actorType" character varying NOT NULL, "userId" character varying, "administratorId" character varying, "source" character varying NOT NULL, "requestId" character varying, "sessionId" character varying, "entityType" character varying NOT NULL, "entityId" character varying NOT NULL, "entityUuid" character varying, "action" character varying NOT NULL, "changes" jsonb NOT NULL, CONSTRAINT "PK_de4ffe355aef65f5e1adff34854" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_9d91d1ad38aaf2bbafee95fd57" ON "change_journal_entry" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_change_journal_entry_occurred_at" ON "change_journal_entry" ("occurredAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_change_journal_entry_entity" ON "change_journal_entry" ("entityType", "entityId", "occurredAt")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "change_journal_entry"`);
    }
}
