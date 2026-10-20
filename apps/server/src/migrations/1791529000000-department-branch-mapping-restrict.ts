import { MigrationInterface, QueryRunner } from 'typeorm';

// #65: a branch referenced by a mapping cannot be deleted (it would leave subtree branches stale).
export class DepartmentBranchMappingRestrict1791529000000 implements MigrationInterface {
    name = 'DepartmentBranchMappingRestrict1791529000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "department_branch_mapping" DROP CONSTRAINT "FK_817eba7d162ccb1cadf8f1986a5"`,
        );
        await queryRunner.query(
            `ALTER TABLE "department_branch_mapping" ADD CONSTRAINT "FK_817eba7d162ccb1cadf8f1986a5" FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "department_branch_mapping" DROP CONSTRAINT "FK_817eba7d162ccb1cadf8f1986a5"`,
        );
        await queryRunner.query(
            `ALTER TABLE "department_branch_mapping" ADD CONSTRAINT "FK_817eba7d162ccb1cadf8f1986a5" FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }
}
