import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationInboxOutcome1791000000014 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" ADD "outcome" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" ADD "outcome_reason" text`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "integration_inbox_event_noop" ON "integration_inbox_event" ("stream", "processed_at") WHERE "outcome" = 'noop'`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."integration_inbox_event_noop"`, undefined);
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" DROP COLUMN "outcome_reason"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" DROP COLUMN "outcome"`,
            undefined,
        );
    }
}
