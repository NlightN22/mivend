import { MigrationInterface, QueryRunner } from 'typeorm';

export class DiscountSetupProductPercent1791543000000 implements MigrationInterface {
    name = 'DiscountSetupProductPercent1791543000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "discount_setup_product" ADD COLUMN IF NOT EXISTS "percent" double precision`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "discount_setup_product" DROP COLUMN IF EXISTS "percent"`,
        );
    }
}
