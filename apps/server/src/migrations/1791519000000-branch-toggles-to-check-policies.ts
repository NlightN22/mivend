import { MigrationInterface, QueryRunner } from 'typeorm';

// Moves the two per-branch toggles into check policy rows (docs/checks-and-policies.md, #241):
// the global-default branch's flags become the global rows, other branches that differ get overrides.
export class BranchTogglesToCheckPolicies1791519000000 implements MigrationInterface {
    name = 'BranchTogglesToCheckPolicies1791519000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const [defaults] = await queryRunner.query(
            `SELECT bs."enforceMultiplicity" AS m, bs."allowExceedingCreditLimit" AS c
             FROM global_settings gs
             INNER JOIN branch_settings bs ON bs."branchId" = gs."customFieldsDefaultbranchid"
             LIMIT 1`,
        );
        const globalMultiplicity = defaults?.m === true;
        const globalExceeding = defaults?.c === true;
        const branches: { branchId: string; m: boolean; c: boolean }[] = await queryRunner.query(
            `SELECT "branchId", "enforceMultiplicity" AS m, "allowExceedingCreditLimit" AS c
             FROM branch_settings`,
        );

        const upsert = async (
            code: string,
            stage: string,
            branchId: string | null,
            consequence: string,
            enabled: boolean,
        ) =>
            queryRunner.query(
                branchId === null
                    ? `INSERT INTO check_policy ("uuid", "checkCode", "stage", "branchId", "consequence", "enabled")
                       VALUES (gen_random_uuid(), $1, $2, NULL, $3, $4)
                       ON CONFLICT ("checkCode", "stage") WHERE "branchId" IS NULL
                       DO UPDATE SET "consequence" = EXCLUDED."consequence", "enabled" = EXCLUDED."enabled"`
                    : `INSERT INTO check_policy ("uuid", "checkCode", "stage", "branchId", "consequence", "enabled")
                       VALUES (gen_random_uuid(), $1, $2, $5, $3, $4)
                       ON CONFLICT ("checkCode", "stage", "branchId") WHERE "branchId" IS NOT NULL
                       DO UPDATE SET "consequence" = EXCLUDED."consequence", "enabled" = EXCLUDED."enabled"`,
                branchId === null
                    ? [code, stage, consequence, enabled]
                    : [code, stage, consequence, enabled, branchId],
            );
        const multiplicity = async (branchId: string | null, enabled: boolean) => {
            await upsert('order.multiplicity', 'cart', branchId, 'block', enabled);
            await upsert('order.multiplicity', 'pre-reserve', branchId, 'hold', enabled);
            await upsert('order.multiplicity', 'on-edit', branchId, 'warn', enabled);
        };
        const credit = async (branchId: string | null, exceeding: boolean) => {
            await upsert('credit.limit', 'checkout', branchId, exceeding ? 'warn' : 'hold', true);
            await upsert('credit.limit', 'on-edit', branchId, 'warn', true);
        };

        await multiplicity(null, globalMultiplicity);
        await credit(null, globalExceeding);
        for (const branch of branches) {
            if (branch.m !== globalMultiplicity) await multiplicity(branch.branchId, branch.m);
            if (branch.c !== globalExceeding) await credit(branch.branchId, branch.c);
        }

        await queryRunner.query(
            `ALTER TABLE "branch_settings" DROP COLUMN IF EXISTS "enforceMultiplicity"`,
        );
        await queryRunner.query(
            `ALTER TABLE "branch_settings" DROP COLUMN IF EXISTS "allowExceedingCreditLimit"`,
        );
    }

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
