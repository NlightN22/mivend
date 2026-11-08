import { MigrationInterface, QueryRunner } from 'typeorm';

// #254: ERP-owned product storage unit and source fields, order accounting flags and shipped-in-settlements.
export class ErpUnreadFieldsCustomFields1791558000000 implements MigrationInterface {
    name = 'ErpUnreadFieldsCustomFields1791558000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "product" ADD "customFieldsErpstorageunitid" character varying(255)`,
        );
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsErpsourcefields" text`);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsErpaccounting" text`);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsErplinkeddocuments" text`);
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsErpshippedinsettlements" text`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsErpshippedinsettlements"`,
        );
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsErplinkeddocuments"`);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsErpaccounting"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsErpsourcefields"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsErpstorageunitid"`);
    }
}
