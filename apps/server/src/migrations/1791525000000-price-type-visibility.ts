import { MigrationInterface, QueryRunner } from 'typeorm';

// #235: every existing type is confidential until a data step classifies the customer set.
export class PriceTypeVisibility1791525000000 implements MigrationInterface {
    name = 'PriceTypeVisibility1791525000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "price_type" ADD "visibility" character varying NOT NULL DEFAULT 'confidential'`,
        );
        await queryRunner.query(
            `ALTER TABLE "price_type" ADD "isPurchase" boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(`ALTER TABLE "price_type" ADD "ceilingMultiplier" numeric(12,6)`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_price_type_single_purchase" ON "price_type" ("isPurchase") WHERE "isPurchase" = true`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_price_type_single_purchase"`);
        await queryRunner.query(`ALTER TABLE "price_type" DROP COLUMN "ceilingMultiplier"`);
        await queryRunner.query(`ALTER TABLE "price_type" DROP COLUMN "isPurchase"`);
        await queryRunner.query(`ALTER TABLE "price_type" DROP COLUMN "visibility"`);
    }
}
