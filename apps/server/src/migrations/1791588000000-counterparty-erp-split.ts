import { MigrationInterface, QueryRunner } from 'typeorm';

// #368: the ERP stream writes a mirror; the counterparty's portal-owned fields are mivend's, with a per-record version.
export class CounterpartyErpSplit1791588000000 implements MigrationInterface {
    name = 'CounterpartyErpSplit1791588000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "version" integer NOT NULL DEFAULT 0`,
        );
        await queryRunner.query(
            `CREATE TABLE "counterparty_erp" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "erpId" character varying NOT NULL, "name" character varying, "fullName" character varying, "inn" character varying, "kpp" character varying, "ogrnip" character varying, "okpo" character varying, "legalType" character varying, "legalFormId" character varying, "regionId" character varying, "legalAddress" character varying, "factualAddress" character varying, "phone" character varying, "officialEmail" character varying, "erpGroupLabel" character varying, "managerId" character varying, "managerIds" text, "contactInfos" text, CONSTRAINT "PK_2e6df18087ea4ddb108017a7b23" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f1b43df3cc6c52133ec94e5597" ON "counterparty_erp" ("erpId")`,
        );
        await queryRunner.query(
            `INSERT INTO "counterparty_erp" ("erpId", "name", "fullName", "inn", "kpp", "ogrnip", "okpo", "legalType", "legalFormId", "regionId", "legalAddress", "factualAddress", "phone", "officialEmail", "erpGroupLabel", "managerId")
             SELECT "erpId", "shortName", "fullName", "inn", "kpp", "ogrnip", "okpo", "legalType", "legalFormId", "regionId", "legalAddress", "factualAddress", "phone", "officialEmail", "erpGroupLabel", "managerErpId"
             FROM "counterparty"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_f1b43df3cc6c52133ec94e5597"`);
        await queryRunner.query(`DROP TABLE "counterparty_erp"`);
        await queryRunner.query(`ALTER TABLE "counterparty" DROP COLUMN "version"`);
    }
}
