import { MigrationInterface, QueryRunner } from 'typeorm';

export class RoleDefaultGrant1791589000000 implements MigrationInterface {
    name = 'RoleDefaultGrant1791589000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "role_default_grant" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "roleCode" character varying NOT NULL, "grantKey" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_9eef20dd6f3d924e58ee24356ce" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f30fe278de7f3ebd8dac960785" ON "role_default_grant" ("roleCode", "grantKey")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_f30fe278de7f3ebd8dac960785"`);
        await queryRunner.query(`DROP TABLE "role_default_grant"`);
    }
}
