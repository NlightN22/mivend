import { MigrationInterface, QueryRunner } from 'typeorm';

// #328: mivend's trading point gets a uuid; the ERP stream writes a separate mirror; customer edits wait as changes.
export class TradingPointErpSplit1791553000000 implements MigrationInterface {
    name = 'TradingPointErpSplit1791553000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "trading_point" ADD "uuid" uuid NOT NULL DEFAULT gen_random_uuid()`,
        );
        await queryRunner.query(`ALTER TABLE "trading_point" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_7dbc688793bc74869d69836768" ON "trading_point" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE TABLE "trading_point_erp" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "erpId" character varying NOT NULL, "counterpartyId" character varying NOT NULL, "name" character varying, "address" character varying, "latitude" double precision, "longitude" double precision, "workingHours" character varying, "contactPhone" character varying, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_3a0e1dffbb57434624af8eaa353" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_45d1a2e0a3e856f29ce8f91567" ON "trading_point_erp" ("erpId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "trading_point_change" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "tradingPointId" character varying NOT NULL, "counterpartyId" character varying NOT NULL, "payload" text NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "requestedByUserId" character varying, "decidedByUserId" character varying, "decidedAt" TIMESTAMP WITH TIME ZONE, "comment" character varying, "version" integer, CONSTRAINT "PK_ff44109b343d6aafec6ac242840" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_ee3d35d362e0aa23590dfa41d2" ON "trading_point_change" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_72a7f0a7bcee55fec5056ec77c" ON "trading_point_change" ("tradingPointId") WHERE "status" = 'pending'`,
        );
        await queryRunner.query(
            `INSERT INTO "trading_point_erp" ("erpId", "counterpartyId", "name", "address", "latitude", "longitude", "workingHours", "isActive")
             SELECT "erpId", "counterpartyId"::varchar, "name", "address", "latitude", "longitude", "workingHours", "isActive"
             FROM "trading_point" WHERE "customerOwned" = false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_72a7f0a7bcee55fec5056ec77c"`);
        await queryRunner.query(`DROP INDEX "IDX_ee3d35d362e0aa23590dfa41d2"`);
        await queryRunner.query(`DROP TABLE "trading_point_change"`);
        await queryRunner.query(`DROP INDEX "IDX_45d1a2e0a3e856f29ce8f91567"`);
        await queryRunner.query(`DROP TABLE "trading_point_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_7dbc688793bc74869d69836768"`);
        await queryRunner.query(`ALTER TABLE "trading_point" DROP COLUMN "uuid"`);
    }
}
