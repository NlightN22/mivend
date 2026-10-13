import { MigrationInterface, QueryRunner } from 'typeorm';

// #206: a proforma number and (order, organization, version) are unique; a withdrawal records who and when.
export class ProformaInvoiceUniqueWithdrawn1791504000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "proforma_invoice"
               ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP WITH TIME ZONE,
               ADD COLUMN IF NOT EXISTS "withdrawnByAdministratorId" character varying`,
        );
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_f8d94b64d17a66ec2d7b71c741"`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_proforma_invoice_number" ON "proforma_invoice" ("number")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_proforma_invoice_order_org_version" ON "proforma_invoice" ("orderId", "organizationId", "version")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_proforma_invoice_order_org_version"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_proforma_invoice_number"`);
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_f8d94b64d17a66ec2d7b71c741" ON "proforma_invoice" ("number")`,
        );
        await queryRunner.query(
            `ALTER TABLE "proforma_invoice" DROP COLUMN "withdrawnByAdministratorId", DROP COLUMN "withdrawnAt"`,
        );
    }
}
