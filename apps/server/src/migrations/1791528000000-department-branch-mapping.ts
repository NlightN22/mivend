import { MigrationInterface, QueryRunner } from 'typeorm';

// #65: staff-maintained department -> branch mapping and the manual counterparty branch override.
export class DepartmentBranchMapping1791528000000 implements MigrationInterface {
    name = 'DepartmentBranchMapping1791528000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "department_branch_mapping" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "departmentErpId" character varying NOT NULL, "branchId" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_bf920b918012a6d4e5b80134a76" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_5510d36572d5253fe7d69306b1" ON "department_branch_mapping" ("departmentErpId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_817eba7d162ccb1cadf8f1986a" ON "department_branch_mapping" ("branchId")`,
        );
        await queryRunner.query(
            `ALTER TABLE "department_branch_mapping" ADD CONSTRAINT "FK_817eba7d162ccb1cadf8f1986a5" FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "counterparty" ADD "branchOverrideId" character varying`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "counterparty" DROP COLUMN "branchOverrideId"`);
        await queryRunner.query(`DROP TABLE "department_branch_mapping"`);
    }
}
