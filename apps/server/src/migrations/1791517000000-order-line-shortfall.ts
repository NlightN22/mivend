import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderLineShortfall1791517000000 implements MigrationInterface {
    name = 'OrderLineShortfall1791517000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "order_line_shortfall" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "uuid" uuid NOT NULL,
                "orderId" character varying NOT NULL,
                "orderLineId" character varying NOT NULL,
                "productVariantId" character varying NOT NULL,
                "organizationId" character varying,
                "requestedQuantity" integer NOT NULL,
                "keptQuantity" integer NOT NULL,
                "shortfallQuantity" integer NOT NULL,
                "limitedBy" character varying,
                "administratorId" character varying,
                "id" SERIAL NOT NULL,
                CONSTRAINT "PK_order_line_shortfall" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_line_shortfall_uuid" ON "order_line_shortfall" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_order_line_shortfall_order" ON "order_line_shortfall" ("orderId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_order_line_shortfall_variant" ON "order_line_shortfall" ("productVariantId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "order_line_shortfall"`);
    }
}
