import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConsistencyReports1791545000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "consistency_report" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "number" SERIAL NOT NULL, "source" character varying NOT NULL, "provider_issue_id" character varying NOT NULL, "type" character varying NOT NULL, "severity" character varying NOT NULL, "entity_type" character varying NOT NULL, "entity_id" character varying NOT NULL, "scope" jsonb NOT NULL DEFAULT '{}'::jsonb, "expected" jsonb, "actual" jsonb, "details" text NOT NULL DEFAULT '', "replayable" boolean NOT NULL DEFAULT false, "occurrences" integer NOT NULL DEFAULT '1', "first_detected_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_detected_at" TIMESTAMP WITH TIME ZONE NOT NULL, "resolved_at" TIMESTAMP WITH TIME ZONE, "status" character varying NOT NULL DEFAULT 'open', CONSTRAINT "PK_986611c7d29b0af78e3162c0708" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_39e1d00df35d18e9756d7a5613" ON "consistency_report" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "consistency_report_number" ON "consistency_report" ("number")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "consistency_report_source_issue" ON "consistency_report" ("source", "provider_issue_id")`,
        );
        await queryRunner.query(
            `CREATE INDEX "consistency_report_list" ON "consistency_report" ("status", "last_detected_at")`,
        );
        await queryRunner.query(
            `CREATE INDEX "consistency_report_retention" ON "consistency_report" ("resolved_at") WHERE "status" = 'resolved'`,
        );
        await queryRunner.query(
            `CREATE TABLE "consistency_source_state" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "source" character varying NOT NULL, "health" character varying NOT NULL, "health_detail" text NOT NULL DEFAULT '', "summary" jsonb, "last_finished_at" TIMESTAMP WITH TIME ZONE, "watermark" TIMESTAMP WITH TIME ZONE, "last_polled_at" TIMESTAMP WITH TIME ZONE, "last_success_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6a92e10093172b98395e496b15a" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_8a5c9768000cfe8b40c0391bdb" ON "consistency_source_state" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "consistency_source_state_source" ON "consistency_source_state" ("source")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "consistency_source_state"`);
        await queryRunner.query(`DROP TABLE "consistency_report"`);
    }
}
