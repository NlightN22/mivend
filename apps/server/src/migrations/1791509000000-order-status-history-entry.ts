import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderStatusHistoryEntry1791509000000 implements MigrationInterface {
    name = 'OrderStatusHistoryEntry1791509000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "order_status_history_entry" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "uuid" uuid NOT NULL,
                "orderId" integer NOT NULL,
                "previousStatus" character varying,
                "status" character varying NOT NULL,
                "id" SERIAL NOT NULL,
                CONSTRAINT "PK_order_status_history_entry" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_status_history_entry_uuid" ON "order_status_history_entry" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_order_status_history_entry_order" ON "order_status_history_entry" ("orderId", "id")`,
        );
        await queryRunner.query(
            `INSERT INTO "order_status_history_entry" ("uuid", "orderId", "previousStatus", "status", "createdAt", "updatedAt")
             SELECT gen_random_uuid(), o."id", NULL, o."customFieldsErpstatus", o."orderPlacedAt", o."orderPlacedAt"
               FROM "order" o
              WHERE o."customFieldsErpstatus" IS NOT NULL
                AND o."orderPlacedAt" IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM "order_status_history_entry" h WHERE h."orderId" = o."id")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "order_status_history_entry"`);
    }
}
