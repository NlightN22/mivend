import { MigrationInterface, QueryRunner } from 'typeorm';

// #123: visibility grants (an administrator sees one more manager's clients), never deleted.
export class VisibilityGrant1791530000000 implements MigrationInterface {
    name = 'VisibilityGrant1791530000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "visibility_grant" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "uuid" uuid NOT NULL, "granteeAdministratorId" character varying NOT NULL, "subjectKind" character varying NOT NULL, "subjectRef" character varying NOT NULL, "validFrom" TIMESTAMP, "validTo" TIMESTAMP, "reason" text NOT NULL, "grantedByAdministratorId" character varying, "revokedAt" TIMESTAMP, "revokedByAdministratorId" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_62b4d96ee7d4cfb6c9038283489" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_cf50d065e01bef4bb6b99ab849" ON "visibility_grant" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_63f42accf9acda5934a4498437" ON "visibility_grant" ("granteeAdministratorId", "subjectKind")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "visibility_grant"`);
    }
}
