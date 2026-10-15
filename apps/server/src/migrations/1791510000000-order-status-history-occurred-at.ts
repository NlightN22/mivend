import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderStatusHistoryOccurredAt1791510000000 implements MigrationInterface {
    name = 'OrderStatusHistoryOccurredAt1791510000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_status_history_entry" ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `UPDATE "order_status_history_entry" SET "occurredAt" = "createdAt" WHERE "occurredAt" IS NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_status_history_entry" ALTER COLUMN "occurredAt" SET DEFAULT now()`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_status_history_entry" ALTER COLUMN "occurredAt" SET NOT NULL`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_order_status_history_entry_order_time" ON "order_status_history_entry" ("orderId", "occurredAt", "id")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_status_history_entry_order_time"`);
        await queryRunner.query(
            `ALTER TABLE "order_status_history_entry" DROP COLUMN IF EXISTS "occurredAt"`,
        );
    }
}
