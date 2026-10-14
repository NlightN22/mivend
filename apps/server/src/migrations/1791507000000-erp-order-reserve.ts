import { MigrationInterface, QueryRunner } from 'typeorm';

export class ErpOrderReserve1791507000000 implements MigrationInterface {
    name = 'ErpOrderReserve1791507000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "erp_order_reserve" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "uuid" uuid NOT NULL,
                "orderId" character varying NOT NULL,
                "productVariantId" character varying NOT NULL,
                "quantity" integer NOT NULL,
                "reserveUntil" TIMESTAMP,
                "id" SERIAL NOT NULL,
                CONSTRAINT "PK_erp_order_reserve" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_erp_order_reserve_uuid" ON "erp_order_reserve" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "idx_erp_order_reserve_order_variant"
               ON "erp_order_reserve" ("orderId", "productVariantId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_erp_order_reserve_order" ON "erp_order_reserve" ("orderId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_erp_order_reserve_variant" ON "erp_order_reserve" ("productVariantId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "erp_order_reserve"`);
    }
}
