import { MigrationInterface, QueryRunner } from 'typeorm';

export class VariantUnitName1791484000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "product_variant" ADD "customFieldsUnitname" character varying(255)`,
        );
        await queryRunner.query(
            `UPDATE "product_variant" pv SET "customFieldsUnitname" = u."name" FROM "unit_record" u WHERE u."entityId" = pv."customFieldsDefaultsalesunitid"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsUnitname"`);
    }
}
