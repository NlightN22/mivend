import { MigrationInterface, QueryRunner } from 'typeorm';

export class ErpReconciliationState1791612000000 implements MigrationInterface {
    name = 'ErpReconciliationState1791612000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "erp_reconciliation_state" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "id" SERIAL NOT NULL,
                "uuid" uuid NOT NULL,
                "aggregateType" character varying NOT NULL,
                "state" character varying NOT NULL,
                "reason" character varying,
                "ourCount" integer NOT NULL,
                "theirCount" integer NOT NULL,
                "gap" integer NOT NULL,
                "flatRuns" integer NOT NULL DEFAULT '0',
                "seedingSince" TIMESTAMP,
                "seedingAlarm" boolean NOT NULL DEFAULT false,
                "inboxBacklog" integer,
                "sourceQueue" integer,
                "lastRunAt" TIMESTAMP NOT NULL,
                "healAttempts" integer NOT NULL DEFAULT '0',
                "healRequestedAt" TIMESTAMP,
                "healOutcome" character varying,
                "healDetail" character varying,
                "healRealRun" boolean,
                CONSTRAINT "PK_d58afd035d7cacf5634900c82a3" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_400ba6c5f0f374eb3dc567d201" ON "erp_reconciliation_state" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_191f60b720bccdc863fafd385b" ON "erp_reconciliation_state" ("aggregateType")`,
        );
        await queryRunner.query(
            `CREATE TABLE "erp_reconciliation_not_found" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "id" SERIAL NOT NULL,
                "uuid" uuid NOT NULL,
                "aggregateType" character varying NOT NULL,
                "entityId" character varying NOT NULL,
                CONSTRAINT "PK_e3d3b8e764dfbdd5dfa635d3952" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_d597841a845954b4621509cf82" ON "erp_reconciliation_not_found" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_5d7c97bc5581fc5cb061792b0a" ON "erp_reconciliation_not_found" ("aggregateType", "entityId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "erp_reconciliation_not_found"`);
        await queryRunner.query(`DROP TABLE "erp_reconciliation_state"`);
    }
}
