import { MigrationInterface, QueryRunner } from 'typeorm';

// #206: number `<order>-<NN>-<version>` (NN of the first version is the document id), per-version dates, kind.
export class ProformaInvoiceNumberDatesKind1791501000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "branch_settings" ADD COLUMN IF NOT EXISTS "proformaPaymentTermDays" integer NOT NULL DEFAULT 3`,
        );
        await queryRunner.query(
            `ALTER TABLE "proforma_invoice"
               ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP WITH TIME ZONE,
               ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP WITH TIME ZONE,
               ADD COLUMN IF NOT EXISTS "kind" character varying NOT NULL DEFAULT 'order-placed',
               ADD COLUMN IF NOT EXISTS "salesInvoiceNumber" character varying`,
        );
        await queryRunner.query(
            `UPDATE "proforma_invoice"
                SET "issuedAt" = "createdAt",
                    "dueDate" = "createdAt" + interval '3 days',
                    "kind" = CASE WHEN "version" > 1 THEN 'order-changed' ELSE 'order-placed' END`,
        );
        await queryRunner.query(
            `ALTER TABLE "proforma_invoice"
               ALTER COLUMN "issuedAt" SET NOT NULL, ALTER COLUMN "issuedAt" SET DEFAULT now(),
               ALTER COLUMN "dueDate" SET NOT NULL, ALTER COLUMN "dueDate" SET DEFAULT now()`,
        );
        await queryRunner.query(
            `WITH base AS (
                SELECT DISTINCT ON ("orderId", "organizationId") "orderId", "organizationId", "number" AS doc
                  FROM "proforma_invoice"
                 WHERE "number" ~ '^[0-9]+-[0-9]+$'
                 ORDER BY "orderId", "organizationId", "version", "id")
             UPDATE "proforma_invoice" p
                SET "number" = b.doc || '-' || p."version"
               FROM base b
              WHERE p."orderId" = b."orderId" AND p."organizationId" = b."organizationId"
                AND p."number" ~ '^[0-9]+-[0-9]+$'`,
        );
        await queryRunner.query(
            `UPDATE "document" d SET "number" = p."number"
               FROM "proforma_invoice" p
              WHERE d."type" = 'proforma-invoice' AND d."proformaInvoiceId"::text = p."id"::text
                AND d."number" <> p."number"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "proforma_invoice"
               DROP COLUMN "salesInvoiceNumber", DROP COLUMN "kind",
               DROP COLUMN "dueDate", DROP COLUMN "issuedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "branch_settings" DROP COLUMN "proformaPaymentTermDays"`,
        );
    }
}
