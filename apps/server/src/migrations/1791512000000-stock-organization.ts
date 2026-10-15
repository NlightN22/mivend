import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockOrganization1791512000000 implements MigrationInterface {
    name = 'StockOrganization1791512000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "storage_location_assignment" ADD COLUMN IF NOT EXISTS "warehouseId" character varying NOT NULL DEFAULT ''`,
        );
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "stock_organization" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "entityId" character varying NOT NULL, "productId" character varying NOT NULL, "organizationErpId" character varying NOT NULL, "quantity" double precision NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "id" SERIAL NOT NULL, CONSTRAINT "PK_stock_organization_id" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_stock_organization_entity_id" ON "stock_organization" ("entityId")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_stock_organization_product_org" ON "stock_organization" ("productId", "organizationErpId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "stock_organization"`);
        await queryRunner.query(
            `ALTER TABLE "storage_location_assignment" DROP COLUMN IF EXISTS "warehouseId"`,
        );
    }
}
