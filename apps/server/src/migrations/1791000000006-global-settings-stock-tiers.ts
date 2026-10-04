import { MigrationInterface, QueryRunner } from 'typeorm';

export class GlobalSettingsStockTiers1791000000006 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings" ADD "customFieldsStocktierlowmax" integer DEFAULT '4'`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "global_settings" ADD "customFieldsStocktiermediummax" integer DEFAULT '19'`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings" DROP COLUMN "customFieldsStocktiermediummax"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "global_settings" DROP COLUMN "customFieldsStocktierlowmax"`,
            undefined,
        );
    }
}
