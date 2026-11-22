import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationMainBankAccount1791597000000 implements MigrationInterface {
    name = 'OrganizationMainBankAccount1791597000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "organization_requisites" ADD COLUMN IF NOT EXISTS "mainBankAccountId" character varying`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "organization_requisites" DROP COLUMN IF EXISTS "mainBankAccountId"`,
        );
    }
}
