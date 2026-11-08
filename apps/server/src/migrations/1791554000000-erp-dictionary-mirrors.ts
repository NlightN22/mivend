import { MigrationInterface, QueryRunner } from 'typeorm';

// #254: ERP-owned mirrors for streams mivend did not consume, plus the unread point-of-sale fields on trading_point_erp.
export class ErpDictionaryMirrors1791554000000 implements MigrationInterface {
    name = 'ErpDictionaryMirrors1791554000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "counterparty_contact_erp" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "erpId" character varying NOT NULL, "counterpartyId" character varying NOT NULL, "name" character varying, "position" character varying, "phone" character varying, "email" character varying, "contactInfos" text, "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_9823df6bfec6afa16b1c7eb2648" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_bb53ea09f6177051724478e85f" ON "counterparty_contact_erp" ("erpId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7a2091230c0e8e2491c13bcdd0" ON "counterparty_contact_erp" ("counterpartyId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "counterparty_group_erp" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "erpId" character varying NOT NULL, "name" character varying, "parentId" character varying, "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_49a50c014cdf7fb6c9c7bc9eba6" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_05e286ad483675fd06e5fabd93" ON "counterparty_group_erp" ("erpId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "point_of_sale_type_erp" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "erpId" character varying NOT NULL, "name" character varying, "code" character varying, "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_41a5a023637d6f315572ae870f0" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_24b369fab29bc2a6258ca6e57f" ON "point_of_sale_type_erp" ("erpId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "product_group_erp" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "erpId" character varying NOT NULL, "name" character varying, "code" character varying, "parentId" character varying, "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_be100c66b1068d6877eace02e6e" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_5769cb7636c445013058a67739" ON "product_group_erp" ("erpId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "setting_erp" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "erpId" character varying NOT NULL, "code" character varying, "boolValue" boolean, "isDeleted" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_e98e33ba7a12bb00c673ed08782" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_d4f6540e81b3cec068cdb35b9b" ON "setting_erp" ("erpId")`,
        );
        await queryRunner.query(
            `ALTER TABLE "trading_point_erp" ADD "isDeleted" boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(`ALTER TABLE "trading_point_erp" ADD "code" character varying`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" ADD "regionId" character varying`);
        await queryRunner.query(
            `ALTER TABLE "trading_point_erp" ADD "storageStock" character varying`,
        );
        await queryRunner.query(`ALTER TABLE "trading_point_erp" ADD "loyalty" character varying`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" ADD "area" double precision`);
        await queryRunner.query(
            `ALTER TABLE "trading_point_erp" ADD "classification" character varying`,
        );
        await queryRunner.query(`ALTER TABLE "trading_point_erp" ADD "hasCompetitors" boolean`);
        await queryRunner.query(
            `ALTER TABLE "trading_point_erp" ADD "mainManagerId" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "trading_point_erp" ADD "bankAccountId" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "trading_point_erp" ADD "internalTransferPointId" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "trading_point_erp" ADD "accuracyRadius" double precision`,
        );
        await queryRunner.query(`ALTER TABLE "trading_point_erp" ADD "productGroupIds" text`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" ADD "managerIds" text`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" ADD "pointTypeIds" text`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" ADD "salesChannels" text`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" ADD "contactInfos" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "contactInfos"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "salesChannels"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "pointTypeIds"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "managerIds"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "productGroupIds"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "accuracyRadius"`);
        await queryRunner.query(
            `ALTER TABLE "trading_point_erp" DROP COLUMN "internalTransferPointId"`,
        );
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "bankAccountId"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "mainManagerId"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "hasCompetitors"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "classification"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "area"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "loyalty"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "storageStock"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "regionId"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "code"`);
        await queryRunner.query(`ALTER TABLE "trading_point_erp" DROP COLUMN "isDeleted"`);
        await queryRunner.query(`DROP INDEX "IDX_d4f6540e81b3cec068cdb35b9b"`);
        await queryRunner.query(`DROP TABLE "setting_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_5769cb7636c445013058a67739"`);
        await queryRunner.query(`DROP TABLE "product_group_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_24b369fab29bc2a6258ca6e57f"`);
        await queryRunner.query(`DROP TABLE "point_of_sale_type_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_05e286ad483675fd06e5fabd93"`);
        await queryRunner.query(`DROP TABLE "counterparty_group_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_7a2091230c0e8e2491c13bcdd0"`);
        await queryRunner.query(`DROP INDEX "IDX_bb53ea09f6177051724478e85f"`);
        await queryRunner.query(`DROP TABLE "counterparty_contact_erp"`);
    }
}
