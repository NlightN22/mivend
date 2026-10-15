import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChecksFramework1791513000000 implements MigrationInterface {
    name = 'ChecksFramework1791513000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "check_policy" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "uuid" uuid NOT NULL,
                "checkCode" character varying NOT NULL,
                "stage" character varying NOT NULL,
                "consequence" character varying NOT NULL,
                "recipient" character varying,
                "enabled" boolean NOT NULL DEFAULT true,
                "id" SERIAL NOT NULL,
                CONSTRAINT "PK_check_policy" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_check_policy_uuid" ON "check_policy" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_check_policy_code_stage" ON "check_policy" ("checkCode", "stage")`,
        );
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "check_policy_history" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "uuid" uuid NOT NULL,
                "checkPolicyId" integer NOT NULL,
                "changedByUserId" character varying,
                "before" jsonb NOT NULL,
                "after" jsonb NOT NULL,
                "id" SERIAL NOT NULL,
                CONSTRAINT "PK_check_policy_history" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_check_policy_history_uuid" ON "check_policy_history" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_check_policy_history_policy" ON "check_policy_history" ("checkPolicyId")`,
        );
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "check_result" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "uuid" uuid NOT NULL,
                "subjectType" character varying NOT NULL,
                "subjectId" character varying NOT NULL,
                "checkCode" character varying NOT NULL,
                "stage" character varying,
                "lineRef" character varying,
                "severity" character varying NOT NULL,
                "messageKey" character varying NOT NULL,
                "facts" jsonb NOT NULL,
                "dataVersion" character varying,
                "computedAt" TIMESTAMP NOT NULL,
                "stale" boolean NOT NULL DEFAULT false,
                "id" SERIAL NOT NULL,
                CONSTRAINT "PK_check_result" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_check_result_uuid" ON "check_result" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_check_result_subject" ON "check_result" ("subjectType", "subjectId", "stage")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "check_result"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "check_policy_history"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "check_policy"`);
    }
}
