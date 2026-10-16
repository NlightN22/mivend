import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderCheckHardening1791515000000 implements MigrationInterface {
    name = 'OrderCheckHardening1791515000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "order_check_failure" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "uuid" uuid NOT NULL,
                "orderId" character varying NOT NULL,
                "stage" character varying NOT NULL,
                "message" text NOT NULL,
                "id" SERIAL NOT NULL,
                CONSTRAINT "PK_order_check_failure" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_check_failure_uuid" ON "order_check_failure" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_order_check_failure_order" ON "order_check_failure" ("orderId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_order_check_failure_created" ON "order_check_failure" ("createdAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_check_result_fresh_orders" ON "check_result" ((("subjectId")::int)) WHERE "subjectType" = 'order' AND "stale" = false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_check_result_fresh_orders"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "order_check_failure"`);
    }
}
