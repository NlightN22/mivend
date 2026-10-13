import { MigrationInterface, QueryRunner } from 'typeorm';

// #206: organization phone and the ERP signatory list (simple-json text column).
export class OrganizationPhoneSignatories1791497000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "organization_requisites"
               ADD COLUMN IF NOT EXISTS "phone" character varying,
               ADD COLUMN IF NOT EXISTS "signatories" text`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "organization_requisites" DROP COLUMN IF EXISTS "signatories", DROP COLUMN IF EXISTS "phone"`,
        );
    }
}
