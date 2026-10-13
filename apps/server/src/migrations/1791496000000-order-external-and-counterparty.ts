import { MigrationInterface, QueryRunner } from 'typeorm';

// #215: orders imported from the ERP are marked external and carry their own counterparty link.
export class OrderExternalAndCounterparty1791496000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order"
               ADD COLUMN IF NOT EXISTS "customFieldsIsexternal" boolean NOT NULL DEFAULT false,
               ADD COLUMN IF NOT EXISTS "customFieldsCounterpartyid" character varying(255),
               ADD COLUMN IF NOT EXISTS "customFieldsPendingcounterpartyerpid" character varying(255)`,
        );
        await queryRunner.query(
            `UPDATE "order" o SET "customFieldsCounterpartyid" = cu."customFieldsCounterpartyid"::text
             FROM "customer" cu
             WHERE cu."id" = o."customerId"
               AND cu."customFieldsCounterpartyid" IS NOT NULL
               AND o."customFieldsCounterpartyid" IS NULL`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_order_custom_fields_counterpartyid"
               ON "order" ("customFieldsCounterpartyid")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_order_custom_fields_pendingcounterpartyerpid"
               ON "order" ("customFieldsPendingcounterpartyerpid")
               WHERE "customFieldsPendingcounterpartyerpid" IS NOT NULL`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_custom_fields_erporderid"
               ON "order" ("customFieldsErporderid")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_custom_fields_erporderid"`);
        await queryRunner.query(
            `DROP INDEX IF EXISTS "IDX_order_custom_fields_pendingcounterpartyerpid"`,
        );
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_custom_fields_counterpartyid"`);
        await queryRunner.query(
            `ALTER TABLE "order"
               DROP COLUMN IF EXISTS "customFieldsPendingcounterpartyerpid",
               DROP COLUMN IF EXISTS "customFieldsCounterpartyid",
               DROP COLUMN IF EXISTS "customFieldsIsexternal"`,
        );
    }
}
