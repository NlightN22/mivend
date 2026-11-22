import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationMainBankAccount1791597000000 implements MigrationInterface {
    name = 'OrganizationMainBankAccount1791597000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "organization_requisites" ADD COLUMN IF NOT EXISTS "mainBankAccountId" character varying`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_ec46fdb93ce91406af68a3e2aa" ON "organization_requisites" ("mainBankAccountId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_ccc60695a703a690aee786ba4f" ON "bank_account_record" ("bankId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ccc60695a703a690aee786ba4f"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ec46fdb93ce91406af68a3e2aa"`);
        await queryRunner.query(
            `ALTER TABLE "organization_requisites" DROP COLUMN IF EXISTS "mainBankAccountId"`,
        );
    }
}
