import { MigrationInterface, QueryRunner } from 'typeorm';

// Staff-edited retention per notification source type; seeded at start and by the cleanup, not here.
// The notification createdAt index bounds the hourly source-type discovery.
export class NotificationRetentionRules1791584000000 implements MigrationInterface {
    name = 'NotificationRetentionRules1791584000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "notification_retention_rule" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "sourceType" character varying NOT NULL, "readDays" integer, "unreadDays" integer, CONSTRAINT "PK_notification_retention_rule" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_290334847e6b62ef7e8664cb3e" ON "notification_retention_rule" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_2d3448dde84559a0947692c50a" ON "notification_retention_rule" ("sourceType")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_b11a5e627c41d4dc3170f1d370" ON "notification" ("createdAt")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_b11a5e627c41d4dc3170f1d370"`);
        await queryRunner.query(`DROP TABLE "notification_retention_rule"`);
    }
}
