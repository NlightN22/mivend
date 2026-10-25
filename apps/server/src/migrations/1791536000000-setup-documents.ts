import { MigrationInterface, QueryRunner } from 'typeorm';

// #290/#289: discount and retro-bonus rules are one row per ERP setup document with member tables.
// Old rows cannot convert into documents, so they are dropped; the ERP re-delivers the documents.
export class SetupDocuments1791536000000 implements MigrationInterface {
    name = 'SetupDocuments1791536000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "retro_bonus_rule"`);
        await queryRunner.query(
            `CREATE TABLE "retro_bonus_rule" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "documentNumber" character varying NOT NULL DEFAULT '', "isInstant" boolean NOT NULL DEFAULT false, "accrualPeriod" character varying, "accrualDayNumber" integer NOT NULL DEFAULT '0', "accrualKind" character varying NOT NULL DEFAULT '', "percent" double precision NOT NULL, "conditionAmount" double precision, "conditionQuantity" double precision, "priceTypeErpId" character varying, "organizationErpId" character varying, "recipientCounterpartyErpId" character varying, "recipientContractErpId" character varying, "validFrom" TIMESTAMP NOT NULL, "validTo" TIMESTAMP, "active" boolean NOT NULL DEFAULT true, "allCounterparties" boolean NOT NULL DEFAULT false, "allProducts" boolean NOT NULL DEFAULT false, "counterpartyMode" character varying NOT NULL DEFAULT 'list', "productMode" character varying NOT NULL DEFAULT 'list', "counterpartyFilter" jsonb, "productFilter" jsonb, "sourceVersion" character varying NOT NULL, "contentHash" character varying(64) NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_2a1ab687885581337e61778ee21" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_2f65c6e26664a8be84c98cf4a8" ON "retro_bonus_rule" ("erpId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_fca378513346b18d0948ca7562" ON "retro_bonus_rule" ("recipientCounterpartyErpId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "retro_bonus_rule_counterparty" ("ruleId" integer NOT NULL, "counterpartyErpId" character varying NOT NULL, CONSTRAINT "PK_c92d542f21793444ec89f68743c" PRIMARY KEY ("ruleId", "counterpartyErpId"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_c92d542f21793444ec89f68743" ON "retro_bonus_rule_counterparty" ("counterpartyErpId", "ruleId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "retro_bonus_rule_product" ("ruleId" integer NOT NULL, "productErpId" character varying NOT NULL, CONSTRAINT "PK_5e6d7ee4b29c6059a1066278103" PRIMARY KEY ("ruleId", "productErpId"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_5e6d7ee4b29c6059a106627810" ON "retro_bonus_rule_product" ("productErpId", "ruleId") `,
        );

        await queryRunner.query(`DELETE FROM "discount_rule" WHERE "recipientType" IS NOT NULL`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discount_rule_active_recipient"`);
        for (const column of [
            'recipientType',
            'recipientErpId',
            'productErpId',
            'condition',
            'conditionValue',
            'limitAmount',
            'sourceVersion',
            'active',
        ]) {
            await queryRunner.query(`ALTER TABLE "discount_rule" DROP COLUMN "${column}"`);
        }
        await queryRunner.query(
            `CREATE TABLE "discount_setup" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "documentNumber" character varying NOT NULL DEFAULT '', "percent" double precision NOT NULL, "conditionName" character varying NOT NULL DEFAULT '', "conditionNumber" double precision, "priceTypeErpId" character varying, "limitPercent" double precision, "validFrom" TIMESTAMP NOT NULL, "validTo" TIMESTAMP, "active" boolean NOT NULL DEFAULT true, "inactiveReason" character varying, "allProducts" boolean NOT NULL DEFAULT false, "productMode" character varying NOT NULL DEFAULT 'list', "productFilter" jsonb, "sourceVersion" character varying NOT NULL, "contentHash" character varying(64) NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_4f6a493c233933378b6d8b17e03" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_0a92286419fd3910244f700bcd" ON "discount_setup" ("erpId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "discount_setup_recipient" ("setupId" integer NOT NULL, "counterpartyErpId" character varying NOT NULL DEFAULT '', "contractErpId" character varying NOT NULL DEFAULT '', CONSTRAINT "PK_500047029ca5ed54617b1c507ff" PRIMARY KEY ("setupId", "counterpartyErpId", "contractErpId"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_500047029ca5ed54617b1c507f" ON "discount_setup_recipient" ("counterpartyErpId", "contractErpId", "setupId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "discount_setup_product" ("setupId" integer NOT NULL, "productErpId" character varying NOT NULL, CONSTRAINT "PK_3927ffcf4d0f90f345e8a92bd55" PRIMARY KEY ("setupId", "productErpId"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_3927ffcf4d0f90f345e8a92bd5" ON "discount_setup_product" ("productErpId", "setupId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "discount_condition_kind" ("erpName" character varying NOT NULL, "metric" character varying NOT NULL, CONSTRAINT "PK_d759a73d03f3f3aa2d4d99cfa8d" PRIMARY KEY ("erpName"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "discount_operation_kind" ("erpName" character varying NOT NULL, CONSTRAINT "PK_69f93252c50cf99c794475ae22e" PRIMARY KEY ("erpName"))`,
        );
        await queryRunner.query(
            `INSERT INTO "discount_condition_kind" ("erpName", "metric") VALUES ('ПоКоличествуТовара', 'quantity'), ('ПоСуммеДокумента', 'amount'), ('БезУсловий', 'unconditional') ON CONFLICT DO NOTHING`,
        );
        await queryRunner.query(
            `INSERT INTO "discount_operation_kind" ("erpName") VALUES ('ПоНоменклатуре') ON CONFLICT DO NOTHING`,
        );
    }

    public async down(): Promise<void> {
        throw new Error(
            'Irreversible: the old per-row rules cannot be rebuilt from setup documents',
        );
    }
}
