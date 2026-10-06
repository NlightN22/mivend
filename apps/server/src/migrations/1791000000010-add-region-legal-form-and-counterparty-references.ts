import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegionLegalFormAndCounterpartyReferences1791000000010 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "region_record" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "entityId" character varying NOT NULL, "name" character varying NOT NULL, "code" character varying NOT NULL, "regionCode" character varying, "addressCode" character varying, "parentId" character varying, "isActive" boolean NOT NULL DEFAULT false, "isDeleted" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, CONSTRAINT "PK_region_record_id" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_region_record_entity_id" ON "region_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "legal_form_record" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "entityId" character varying NOT NULL, "name" character varying NOT NULL, "code" character varying NOT NULL, "fullName" character varying, "isActive" boolean NOT NULL DEFAULT false, "isDeleted" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, CONSTRAINT "PK_legal_form_record_id" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_legal_form_record_entity_id" ON "legal_form_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "mainContractId" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "fullName" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "mainBankAccountId" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "ogrnip" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "kpp" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "okpo" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "legalType" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "regionId" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "legalFormId" character varying`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "counterparty" DROP COLUMN "legalFormId"`, undefined);
        await queryRunner.query(`ALTER TABLE "counterparty" DROP COLUMN "regionId"`, undefined);
        await queryRunner.query(`ALTER TABLE "counterparty" DROP COLUMN "legalType"`, undefined);
        await queryRunner.query(`ALTER TABLE "counterparty" DROP COLUMN "okpo"`, undefined);
        await queryRunner.query(`ALTER TABLE "counterparty" DROP COLUMN "kpp"`, undefined);
        await queryRunner.query(`ALTER TABLE "counterparty" DROP COLUMN "ogrnip"`, undefined);
        await queryRunner.query(
            `ALTER TABLE "counterparty" DROP COLUMN "mainBankAccountId"`,
            undefined,
        );
        await queryRunner.query(`ALTER TABLE "counterparty" DROP COLUMN "fullName"`, undefined);
        await queryRunner.query(
            `ALTER TABLE "counterparty" DROP COLUMN "mainContractId"`,
            undefined,
        );
        await queryRunner.query(`DROP TABLE "legal_form_record"`, undefined);
        await queryRunner.query(`DROP TABLE "region_record"`, undefined);
    }
}
