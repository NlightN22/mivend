import { MigrationInterface, QueryRunner } from 'typeorm';

// #332: the one-off contact reapply was dropped; its cursor table and keyset index go.
export class DropContactReapply1791577000000 implements MigrationInterface {
    name = 'DropContactReapply1791577000000';
    // CONCURRENTLY cannot run in a transaction; Vendure runs migrations with transaction 'each'.
    transaction = false;

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "integration_reapply_cursor"`);
        await queryRunner.query(
            `DROP INDEX CONCURRENTLY IF EXISTS "integration_inbox_event_reapply"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "integration_reapply_cursor" ("stream" character varying NOT NULL, "lastId" bigint NOT NULL DEFAULT '0', "done" boolean NOT NULL DEFAULT false, "applied" integer NOT NULL DEFAULT '0', "skipped" integer NOT NULL DEFAULT '0', "lockedUntil" TIMESTAMP WITH TIME ZONE, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c5202855e567be677ca5b4d7132" PRIMARY KEY ("stream"))`,
        );
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "integration_inbox_event_reapply" ON "integration_inbox_event" ("stream", "id") WHERE "status" = 'processed'`,
        );
    }
}
