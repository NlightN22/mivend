import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderEventVersions1791610000000 implements MigrationInterface {
    name = 'OrderEventVersions1791610000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsErpchangedversion" character varying(255)`,
        );
        await queryRunner.query(
            `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsErpstateversion" character varying(255)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsErpchangedversion"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsErpstateversion"`,
        );
    }
}
