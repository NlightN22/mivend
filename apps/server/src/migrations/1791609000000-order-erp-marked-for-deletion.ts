import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderErpMarkedForDeletion1791609000000 implements MigrationInterface {
    name = 'OrderErpMarkedForDeletion1791609000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsErpmarkedfordeletion" boolean`,
        );
        await queryRunner.query(
            `ALTER TABLE "global_settings"
               ADD COLUMN IF NOT EXISTS "customFieldsExternalorderretentionmonths" integer DEFAULT '12'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings" DROP COLUMN IF EXISTS "customFieldsExternalorderretentionmonths"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsErpmarkedfordeletion"`,
        );
    }
}
