import { MigrationInterface, QueryRunner } from 'typeorm';

// Explains why an active filter-mode retro-bonus rule never applies; backfills existing rows.
export class RetroBonusRuleInactiveReason1791538000000 implements MigrationInterface {
    name = 'RetroBonusRuleInactiveReason1791538000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "retro_bonus_rule" ADD COLUMN IF NOT EXISTS "inactiveReason" character varying`,
        );
        await queryRunner.query(
            `UPDATE "retro_bonus_rule" SET "inactiveReason" = CASE
               WHEN "counterpartyMode" = 'filter' AND NOT "allCounterparties" THEN 'counterparty-filter'
               WHEN "productMode" = 'filter' AND NOT "allProducts" THEN 'product-filter' END
             WHERE "inactiveReason" IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "retro_bonus_rule" DROP COLUMN IF EXISTS "inactiveReason"`,
        );
    }
}
