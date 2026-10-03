import { MigrationInterface, QueryRunner } from 'typeorm';

// Issue #102: @mivend/plugin-retro-bonus's RetroBonusRule — read-only, upsert-only ERP
// retro-bonus terms log.
export class AddRetroBonusRuleTable1790949195345 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "retro_bonus_rule" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "productErpId" character varying NOT NULL, "counterpartyErpId" character varying NOT NULL, "recipientContractErpId" character varying, "priceTypeErpId" character varying, "isInstant" boolean NOT NULL DEFAULT false, "accrualPeriod" character varying, "accrualDayNumber" integer NOT NULL DEFAULT '0', "accrualKind" character varying NOT NULL, "percent" double precision NOT NULL, "limitAmount" double precision, "conditionAmount" double precision, "conditionQuantity" double precision, "validFrom" TIMESTAMP NOT NULL, "validTo" TIMESTAMP, "sourceVersion" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_2a1ab687885581337e61778ee21" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_2f65c6e26664a8be84c98cf4a8" ON "retro_bonus_rule" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_c5c2309430f860c56ad2121088" ON "retro_bonus_rule" ("counterpartyErpId", "recipientContractErpId") `,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c5c2309430f860c56ad2121088"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_2f65c6e26664a8be84c98cf4a8"`, undefined);
        await queryRunner.query(`DROP TABLE "retro_bonus_rule"`, undefined);
    }
}
