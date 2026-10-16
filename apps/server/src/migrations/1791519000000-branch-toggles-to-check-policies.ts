import { MigrationInterface, QueryRunner } from 'typeorm';

import { planPolicyRows } from '../migration-helpers/branch-toggles.plan';

// Moves the two per-branch toggles into check policy rows (docs/checks-and-policies.md, #241).
// A database whose columns are already gone (a dev contour whose schema was synchronized) has nothing to move.
export class BranchTogglesToCheckPolicies1791519000000 implements MigrationInterface {
    name = 'BranchTogglesToCheckPolicies1791519000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const present: { column_name: string }[] = await queryRunner.query(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'branch_settings'
                AND column_name IN ('enforceMultiplicity', 'allowExceedingCreditLimit')`,
        );
        if (present.length === 2) await this.moveData(queryRunner);
        await queryRunner.query(
            `ALTER TABLE "branch_settings" DROP COLUMN IF EXISTS "enforceMultiplicity"`,
        );
        await queryRunner.query(
            `ALTER TABLE "branch_settings" DROP COLUMN IF EXISTS "allowExceedingCreditLimit"`,
        );
    }

    private async moveData(queryRunner: QueryRunner): Promise<void> {
        const rows: { branchId: string; m: boolean; c: boolean }[] = await queryRunner.query(
            `SELECT "branchId", "enforceMultiplicity" AS m, "allowExceedingCreditLimit" AS c FROM branch_settings`,
        );
        const branches = rows.map(r => ({
            branchId: r.branchId,
            multiplicity: r.m,
            exceeding: r.c,
        }));
        const [defaultRow] = await queryRunner.query(
            `SELECT "customFieldsDefaultbranchid" AS id FROM global_settings LIMIT 1`,
        );
        const globalDefault = branches.find(b => b.branchId === defaultRow?.id) ?? null;
        for (const row of planPolicyRows(globalDefault, branches)) {
            await queryRunner.query(
                row.branchId === null
                    ? `INSERT INTO check_policy ("uuid", "checkCode", "stage", "branchId", "consequence", "enabled")
                       VALUES (gen_random_uuid(), $1, $2, NULL, $3, $4)
                       ON CONFLICT ("checkCode", "stage") WHERE "branchId" IS NULL
                       DO UPDATE SET "consequence" = EXCLUDED."consequence", "enabled" = EXCLUDED."enabled"`
                    : `INSERT INTO check_policy ("uuid", "checkCode", "stage", "branchId", "consequence", "enabled")
                       VALUES (gen_random_uuid(), $1, $2, $5, $3, $4)
                       ON CONFLICT ("checkCode", "stage", "branchId") WHERE "branchId" IS NOT NULL
                       DO UPDATE SET "consequence" = EXCLUDED."consequence", "enabled" = EXCLUDED."enabled"`,
                row.branchId === null
                    ? [row.code, row.stage, row.consequence, row.enabled]
                    : [row.code, row.stage, row.consequence, row.enabled, row.branchId],
            );
        }
    }

    // Lossy: the restored columns are all false and the policy rows are deleted (dev data only, no production).
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "branch_settings" ADD COLUMN IF NOT EXISTS "enforceMultiplicity" boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(
            `ALTER TABLE "branch_settings" ADD COLUMN IF NOT EXISTS "allowExceedingCreditLimit" boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(
            `DELETE FROM check_policy WHERE "checkCode" IN ('order.multiplicity', 'credit.limit')`,
        );
    }
}
