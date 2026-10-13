import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderErpPaidAmount1791502000000 implements MigrationInterface {
    name = 'OrderErpPaidAmount1791502000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsErppaidamount" double precision`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsErppaidamount"`,
        );
    }
}
