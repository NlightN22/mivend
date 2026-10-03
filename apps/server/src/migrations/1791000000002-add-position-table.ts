import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPositionTable1791000000002 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "position" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "name" character varying NOT NULL, "parentErpId" character varying, "isActive" boolean NOT NULL DEFAULT true, "id" SERIAL NOT NULL, CONSTRAINT "PK_b7f483581562b4dc62ae1a5b7e2" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_4baa0461f36efe6c45985bf2d5" ON "position" ("erpId") `,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_4baa0461f36efe6c45985bf2d5"`, undefined);
        await queryRunner.query(`DROP TABLE "position"`, undefined);
    }
}
