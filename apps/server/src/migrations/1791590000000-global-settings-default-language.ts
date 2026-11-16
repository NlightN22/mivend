import { MigrationInterface, QueryRunner } from 'typeorm';

export class GlobalSettingsDefaultLanguage1791590000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings" ADD "customFieldsDefaultlanguage" character varying(255)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings" DROP COLUMN "customFieldsDefaultlanguage"`,
        );
    }
}
