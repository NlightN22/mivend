import { MigrationInterface, QueryRunner } from 'typeorm';

// Seeds the credit-term policy with the role whose limit decides escalation (docs/checks-and-policies.md, #242).
export class CreditTermPolicyRecipient1791520000000 implements MigrationInterface {
    name = 'CreditTermPolicyRecipient1791520000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO check_policy ("uuid", "checkCode", "stage", "branchId", "consequence", "recipient", "enabled")
             VALUES (gen_random_uuid(), 'manager.credit-term-extension', 'extend-credit-term', NULL, 'require-approval', 'department-head', true)
             ON CONFLICT ("checkCode", "stage") WHERE "branchId" IS NULL
             DO UPDATE SET "recipient" = 'department-head' WHERE check_policy."recipient" IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM check_policy WHERE "checkCode" = 'manager.credit-term-extension' AND "stage" = 'extend-credit-term' AND "branchId" IS NULL AND "recipient" = 'department-head'`,
        );
    }
}
