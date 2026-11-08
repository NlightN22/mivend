import { MigrationInterface, QueryRunner } from 'typeorm';

// #337: bulk operation batches and their per-record result rows; the human number is the table's own serial.
export class BulkBatches1791562000000 implements MigrationInterface {
    name = 'BulkBatches1791562000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "bulk_batch" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "number" SERIAL NOT NULL, "operationType" character varying NOT NULL, "parameters" jsonb NOT NULL DEFAULT '{}', "status" character varying NOT NULL DEFAULT 'draft', "createdById" character varying NOT NULL, "undoOfBatchId" integer, "selectionHash" character varying NOT NULL, "totalCount" integer NOT NULL DEFAULT '0', "appliedCount" integer NOT NULL DEFAULT '0', "skippedCount" integer NOT NULL DEFAULT '0', "failedCount" integer NOT NULL DEFAULT '0', "startedAt" TIMESTAMP, "finishedAt" TIMESTAMP, "errorMessage" text, CONSTRAINT "PK_4f7e9ce277f4d77d90d7c345554" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_0d2074f99bb5731fc3d0894276" ON "bulk_batch" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_4dc9e4e2cc95dd6e0b7bfa93f5" ON "bulk_batch" ("number")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_629d6ddad618d4c12205111af0" ON "bulk_batch" ("operationType")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_979a96e734deef8acbb7fcefc2" ON "bulk_batch" ("createdById", "selectionHash") WHERE "status" = 'draft'`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_2fcea948315a0282a8bd6bf578" ON "bulk_batch" ("undoOfBatchId") WHERE "undoOfBatchId" IS NOT NULL`,
        );
        await queryRunner.query(
            `CREATE TABLE "bulk_batch_item" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "batchId" integer NOT NULL, "targetId" character varying NOT NULL, "label" character varying, "previewOutcome" character varying NOT NULL, "previewReasonCode" character varying, "outcome" character varying, "reasonCode" character varying, "message" text, CONSTRAINT "PK_a9c6a2900ce15d53c42ac3f033c" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_4f5cbe6ce8d307b7ed266f20de" ON "bulk_batch_item" ("batchId", "targetId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "bulk_batch_item"`);
        await queryRunner.query(`DROP TABLE "bulk_batch"`);
    }
}
