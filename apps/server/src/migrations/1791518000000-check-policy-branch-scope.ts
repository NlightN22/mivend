import { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckPolicyBranchScope1791518000000 implements MigrationInterface {
    name = 'CheckPolicyBranchScope1791518000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "check_policy" ADD COLUMN IF NOT EXISTS "branchId" character varying`,
        );
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_check_policy_code_stage"`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_check_policy_global" ON "check_policy" ("checkCode", "stage") WHERE "branchId" IS NULL`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_check_policy_branch" ON "check_policy" ("checkCode", "stage", "branchId") WHERE "branchId" IS NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_check_policy_branch"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_check_policy_global"`);
        await queryRunner.query(`DELETE FROM "check_policy" WHERE "branchId" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "check_policy" DROP COLUMN IF EXISTS "branchId"`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_check_policy_code_stage" ON "check_policy" ("checkCode", "stage")`,
        );
    }
}
