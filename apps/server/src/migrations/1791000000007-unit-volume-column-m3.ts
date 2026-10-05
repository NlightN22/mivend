import { MigrationInterface, QueryRunner } from 'typeorm';

// Unit volume is stored in cubic metres as the ERP sends it; the old names claimed litres.
export class UnitVolumeColumnM31791000000007 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "unit_record" RENAME COLUMN "volumeL" TO "volumeM3"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" RENAME COLUMN "customFieldsUnitvolumel" TO "customFieldsUnitvolumem3"`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "product_variant" RENAME COLUMN "customFieldsUnitvolumem3" TO "customFieldsUnitvolumel"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "unit_record" RENAME COLUMN "volumeM3" TO "volumeL"`,
            undefined,
        );
    }
}
