import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductManufacturerPartNumber1791000000008 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "product" ADD "customFieldsManufacturerpartnumber" character varying(255)`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "product" DROP COLUMN "customFieldsManufacturerpartnumber"`,
            undefined,
        );
    }
}
