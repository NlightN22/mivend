import { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckStaleRequest1791516000000 implements MigrationInterface {
    name = 'CheckStaleRequest1791516000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "check_stale_request" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "uuid" uuid NOT NULL,
                "kind" character varying NOT NULL,
                "key" character varying NOT NULL,
                "version" integer NOT NULL DEFAULT 1,
                "id" SERIAL NOT NULL,
                CONSTRAINT "PK_check_stale_request" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_check_stale_request_uuid" ON "check_stale_request" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_check_stale_request_kind_key" ON "check_stale_request" ("kind", "key")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "check_stale_request"`);
    }
}
