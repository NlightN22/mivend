import { MigrationInterface, QueryRunner } from 'typeorm';

// Issue #103: `unit` stream local cache (UnitRecord) + BranchSettings.allowPiecewiseSale.
export class AddUnitRecordAndAllowPiecewiseSale1790600000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "unit_record" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "entityId" character varying NOT NULL, "ownerId" character varying, "code" character varying NOT NULL, "name" character varying NOT NULL, "ratioToBase" double precision NOT NULL, "weightKg" double precision, "volumeL" double precision, "isDeleted" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, CONSTRAINT "PK_unit_record_id" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_unit_record_entity_id" ON "unit_record" ("entityId")`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "branch_settings" ADD "allowPiecewiseSale" boolean NOT NULL DEFAULT true`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "branch_settings" DROP COLUMN "allowPiecewiseSale"`,
            undefined,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_unit_record_entity_id"`, undefined);
        await queryRunner.query(`DROP TABLE "unit_record"`, undefined);
    }
}
