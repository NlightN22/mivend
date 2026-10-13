import { MigrationInterface, QueryRunner } from 'typeorm';

export class SettlementCustomerVisibility1791500000000 implements MigrationInterface {
    name = 'SettlementCustomerVisibility1791500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings"
               ADD COLUMN IF NOT EXISTS "customFieldsSettlementcustomercontractkinds" character varying(255),
               ADD COLUMN IF NOT EXISTS "customFieldsSettlementtypecategories" text`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings"
               DROP COLUMN IF EXISTS "customFieldsSettlementcustomercontractkinds",
               DROP COLUMN IF EXISTS "customFieldsSettlementtypecategories"`,
        );
    }
}
