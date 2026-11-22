import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationMainBankAccount1791597000000 implements MigrationInterface {
    name = 'OrganizationMainBankAccount1791597000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "organization_requisites" ADD COLUMN IF NOT EXISTS "mainBankAccountId" character varying`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_org_requisites_main_bank_account" ON "organization_requisites" ("mainBankAccountId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_bank_account_record_bank_id" ON "bank_account_record" ("bankId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bank_account_record_bank_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_org_requisites_main_bank_account"`);
        await queryRunner.query(
            `ALTER TABLE "organization_requisites" DROP COLUMN IF EXISTS "mainBankAccountId"`,
        );
    }
}
