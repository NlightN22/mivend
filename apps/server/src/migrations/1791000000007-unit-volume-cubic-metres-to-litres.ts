import { MigrationInterface, QueryRunner } from 'typeorm';

// The ERP sends unit volume in cubic metres; it was stored unconverted in a litres column.
export class UnitVolumeCubicMetresToLitres1791000000007 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "unit_record" SET "volumeL" = "volumeL" * 1000 WHERE "volumeL" IS NOT NULL`,
            undefined,
        );
        await queryRunner.query(
            `UPDATE "product_variant" SET "customFieldsUnitvolumel" = "customFieldsUnitvolumel" * 1000 WHERE "customFieldsUnitvolumel" IS NOT NULL`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "product_variant" SET "customFieldsUnitvolumel" = "customFieldsUnitvolumel" / 1000 WHERE "customFieldsUnitvolumel" IS NOT NULL`,
            undefined,
        );
        await queryRunner.query(
            `UPDATE "unit_record" SET "volumeL" = "volumeL" / 1000 WHERE "volumeL" IS NOT NULL`,
            undefined,
        );
    }
}
