import { MigrationInterface, QueryRunner } from 'typeorm';

// #213: a failed replay overwrites lastError, so the #212 undecodable signal needs its own
// durable column. Backfills existing rows from the old lastError-prefix signal.
export class InboxUndecodable1791482000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" ADD "undecodable" boolean NOT NULL DEFAULT false`,
            undefined,
        );
        await queryRunner.query(
            `UPDATE "integration_inbox_event" SET "undecodable" = true WHERE "last_error" LIKE 'decode failed:%'`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" DROP COLUMN "undecodable"`,
            undefined,
        );
    }
}
