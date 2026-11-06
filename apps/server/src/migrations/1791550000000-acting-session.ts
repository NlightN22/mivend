import { MigrationInterface, QueryRunner } from 'typeorm';

// #322: acting session flags on the session row, the acting cart marker on the order, and the one-time ticket table.
export class ActingSession1791550000000 implements MigrationInterface {
    name = 'ActingSession1791550000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const column of [
            'Actingadministratorid',
            'Actingparentsessionid',
            'Actingtradingpointid',
        ]) {
            await queryRunner.query(
                `ALTER TABLE "session" ADD "customFields${column}" character varying(255)`,
            );
        }
        for (const column of ['Actingsessionid', 'Actingadministratorid']) {
            await queryRunner.query(
                `ALTER TABLE "order" ADD "customFields${column}" character varying(255)`,
            );
        }
        await queryRunner.query(
            `CREATE INDEX "IDX_order_acting_session" ON "order" ("customFieldsActingsessionid") WHERE "customFieldsActingsessionid" IS NOT NULL`,
        );
        await queryRunner.query(
            `CREATE TABLE "acting_ticket" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "tokenHash" character varying NOT NULL, "administratorId" character varying NOT NULL, "parentSessionId" character varying NOT NULL, "counterpartyId" character varying NOT NULL, "customerId" character varying NOT NULL, "tradingPointId" character varying, "expiresAt" TIMESTAMP NOT NULL, "usedAt" TIMESTAMP, CONSTRAINT "UQ_acting_ticket_token_hash" UNIQUE ("tokenHash"), CONSTRAINT "PK_acting_ticket" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_acting_ticket_uuid" ON "acting_ticket" ("uuid")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "acting_ticket"`);
        await queryRunner.query(`DROP INDEX "IDX_order_acting_session"`);
        for (const column of ['Actingsessionid', 'Actingadministratorid']) {
            await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFields${column}"`);
        }
        for (const column of [
            'Actingadministratorid',
            'Actingparentsessionid',
            'Actingtradingpointid',
        ]) {
            await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "customFields${column}"`);
        }
    }
}
