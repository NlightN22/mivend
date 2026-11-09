import { MigrationInterface, QueryRunner } from 'typeorm';

// #332: contact points (channels), roles and per-owner link tables; contact_person gains uuid/source/ERP id so ERP-backed people fit.
export class ContactPoints1791566000000 implements MigrationInterface {
    name = 'ContactPoints1791566000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "contact_point" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "uuid" uuid NOT NULL, "type" character varying NOT NULL, "value" character varying NOT NULL, "normalizedValue" character varying, "isUsable" boolean NOT NULL DEFAULT true, "label" character varying, "isPrimary" boolean NOT NULL DEFAULT false, "comment" character varying, "source" character varying NOT NULL DEFAULT 'manual', "id" SERIAL NOT NULL, CONSTRAINT "PK_a4953bfa453e555c2185e51dd4a" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_96be29cb82e367bfaecaa2b894" ON "contact_point" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE TABLE "contact_role" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "uuid" uuid NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_7cf3b9efd4685be3360e2f91ba7" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_43f1b55c697fe83d86b189d723" ON "contact_role" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_386189eca0183614d547c2c57c" ON "contact_role" ("code")`,
        );
        await queryRunner.query(
            `INSERT INTO "contact_role" ("uuid", "code", "name") VALUES (gen_random_uuid(), 'accounting', 'Accounting'), (gen_random_uuid(), 'receiving', 'Goods receiving'), (gen_random_uuid(), 'ordering', 'Ordering'), (gen_random_uuid(), 'trusted', 'Trusted person'), (gen_random_uuid(), 'general', 'General')`,
        );
        await queryRunner.query(
            `CREATE TABLE "counterparty_contact_point" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "contactPointId" integer NOT NULL, "roleId" integer, "isPrimary" boolean NOT NULL DEFAULT false, "counterpartyId" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_2fc2783ecc62bf47342335b8dd0" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_8809c1d03cce08d497e66da66c" ON "counterparty_contact_point" ("counterpartyId", "contactPointId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "trading_point_contact_point" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "contactPointId" integer NOT NULL, "roleId" integer, "isPrimary" boolean NOT NULL DEFAULT false, "tradingPointId" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_0afe76faa45159ac7310a6ae5ba" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_355ae4841e6faf86ba091e0a14" ON "trading_point_contact_point" ("tradingPointId", "contactPointId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "contact_person_contact_point" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "contactPointId" integer NOT NULL, "roleId" integer, "isPrimary" boolean NOT NULL DEFAULT false, "contactPersonId" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_906e6dee3532369de846c6c829c" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_34c02c1223cb60b669a63c3af4" ON "contact_person_contact_point" ("contactPersonId", "contactPointId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "administrator_contact_point" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "contactPointId" integer NOT NULL, "roleId" integer, "isPrimary" boolean NOT NULL DEFAULT false, "administratorId" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_7fea622e04a1d4cf0c84bc0fb21" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_c43ea64e0a904bda5447df8bbc" ON "administrator_contact_point" ("administratorId", "contactPointId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "counterparty_contact_person" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "counterpartyId" integer NOT NULL, "contactPersonId" integer NOT NULL, "roleId" integer, "isPrimary" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, CONSTRAINT "PK_e6a137c896c224dc05d374909b5" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_c8bf258a0c2942fe07a373ddbc" ON "counterparty_contact_person" ("counterpartyId", "contactPersonId")`,
        );
        await queryRunner.query(`ALTER TABLE "contact_person" ADD "uuid" uuid`);
        await queryRunner.query(
            `UPDATE "contact_person" SET "uuid" = gen_random_uuid() WHERE "uuid" IS NULL`,
        );
        await queryRunner.query(`ALTER TABLE "contact_person" ALTER COLUMN "uuid" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "contact_person" ADD "position" character varying`);
        await queryRunner.query(
            `ALTER TABLE "contact_person" ADD "source" character varying NOT NULL DEFAULT 'manual'`,
        );
        await queryRunner.query(`ALTER TABLE "contact_person" ADD "erpId" character varying`);
        await queryRunner.query(
            `ALTER TABLE "contact_person" ADD "isActive" boolean NOT NULL DEFAULT true`,
        );
        await queryRunner.query(
            `ALTER TABLE "contact_person" ALTER COLUMN "tradingPointId" DROP NOT NULL`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_b251140d371e3597539386e727" ON "contact_person" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_75fa3445f5fd008cace4cbd25e" ON "contact_person" ("erpId")`,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty_contact_point" ADD CONSTRAINT "FK_d04e9cd47509fdb670351e992a4" FOREIGN KEY ("contactPointId") REFERENCES "contact_point"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty_contact_point" ADD CONSTRAINT "FK_f5ef17777e2e92d6e86798ce75f" FOREIGN KEY ("roleId") REFERENCES "contact_role"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty_contact_point" ADD CONSTRAINT "FK_05fb286bd91d761dc9b82a346e4" FOREIGN KEY ("counterpartyId") REFERENCES "counterparty"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "trading_point_contact_point" ADD CONSTRAINT "FK_97851240160f6ecb588201abbf3" FOREIGN KEY ("contactPointId") REFERENCES "contact_point"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "trading_point_contact_point" ADD CONSTRAINT "FK_e499850d835497816efa46d4b2a" FOREIGN KEY ("roleId") REFERENCES "contact_role"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "trading_point_contact_point" ADD CONSTRAINT "FK_71566928a7c385a1227128d8820" FOREIGN KEY ("tradingPointId") REFERENCES "trading_point"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "contact_person_contact_point" ADD CONSTRAINT "FK_cb19d3d3cc750398c9045707acd" FOREIGN KEY ("contactPointId") REFERENCES "contact_point"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "contact_person_contact_point" ADD CONSTRAINT "FK_fd62e9d8124fe623243941b43bf" FOREIGN KEY ("roleId") REFERENCES "contact_role"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "contact_person_contact_point" ADD CONSTRAINT "FK_186df7d87a8195148cd62ce3d0a" FOREIGN KEY ("contactPersonId") REFERENCES "contact_person"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "administrator_contact_point" ADD CONSTRAINT "FK_a6cf206362edb770f5ee2ce6e6c" FOREIGN KEY ("contactPointId") REFERENCES "contact_point"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "administrator_contact_point" ADD CONSTRAINT "FK_f0076aea68143d0367fc25b5e79" FOREIGN KEY ("roleId") REFERENCES "contact_role"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "administrator_contact_point" ADD CONSTRAINT "FK_2080bad48ffeacecdfc3d46cc38" FOREIGN KEY ("administratorId") REFERENCES "administrator"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty_contact_person" ADD CONSTRAINT "FK_c12e625e59dc97a1826cd8172af" FOREIGN KEY ("counterpartyId") REFERENCES "counterparty"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty_contact_person" ADD CONSTRAINT "FK_04602c03151ed9bf875b7294060" FOREIGN KEY ("contactPersonId") REFERENCES "contact_person"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty_contact_person" ADD CONSTRAINT "FK_90384f12d6eef98b59289a34bbf" FOREIGN KEY ("roleId") REFERENCES "contact_role"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "counterparty_contact_person"`);
        await queryRunner.query(`DROP TABLE "administrator_contact_point"`);
        await queryRunner.query(`DROP TABLE "contact_person_contact_point"`);
        await queryRunner.query(`DROP TABLE "trading_point_contact_point"`);
        await queryRunner.query(`DROP TABLE "counterparty_contact_point"`);
        await queryRunner.query(`DROP TABLE "contact_role"`);
        await queryRunner.query(`DROP TABLE "contact_point"`);
        await queryRunner.query(`DROP INDEX "IDX_75fa3445f5fd008cace4cbd25e"`);
        await queryRunner.query(`DROP INDEX "IDX_b251140d371e3597539386e727"`);
        await queryRunner.query(`DELETE FROM "contact_person" WHERE "tradingPointId" IS NULL`);
        await queryRunner.query(
            `ALTER TABLE "contact_person" ALTER COLUMN "tradingPointId" SET NOT NULL`,
        );
        for (const column of ['isActive', 'erpId', 'source', 'position', 'uuid']) {
            await queryRunner.query(`ALTER TABLE "contact_person" DROP COLUMN "${column}"`);
        }
    }
}
