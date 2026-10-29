import { MigrationInterface, QueryRunner } from 'typeorm';

// #298: the ERP creation date (source_fields) decides which products count as new arrivals.
export class ProductErpCreatedAt1791541000000 implements MigrationInterface {
    name = 'ProductErpCreatedAt1791541000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsErpcreatedat" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsErpcreatedat"`);
    }
}
