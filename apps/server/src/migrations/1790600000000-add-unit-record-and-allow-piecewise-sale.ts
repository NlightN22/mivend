import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnitRecordAndAllowPiecewiseSale1790600000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "unit_record" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "entityId" character varying NOT NULL, "ownerId" character varying, "code" character varying NOT NULL, "name" character varying NOT NULL, "ratioToBase" double precision NOT NULL, "weightKg" double precision, "volumeL" double precision, "isDeleted" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, CONSTRAINT "PK_dd6660c0c3e776be257a0d87a83" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_1ec55424781d8b9d5d3f5cf56d" ON "unit_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" ADD "customFieldsUnitratiotobase" double precision`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" ADD "customFieldsUnitweightkg" double precision`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" ADD "customFieldsUnitvolumel" double precision`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" ADD "customFieldsDefaultsalesunitid" character varying(255)`,
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
        await queryRunner.query(
            `ALTER TABLE "product_variant" DROP COLUMN "customFieldsDefaultsalesunitid"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" DROP COLUMN "customFieldsUnitvolumel"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" DROP COLUMN "customFieldsUnitweightkg"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" DROP COLUMN "customFieldsUnitratiotobase"`,
            undefined,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_1ec55424781d8b9d5d3f5cf56d"`, undefined);
        await queryRunner.query(`DROP TABLE "unit_record"`, undefined);
    }
}
