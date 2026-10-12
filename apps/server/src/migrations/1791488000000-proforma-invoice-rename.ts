import { MigrationInterface, QueryRunner } from 'typeorm';

const LINK_TABLES = [
    'payment_attempt',
    'settlement_entry',
    'payment_reconciliation_issue',
    'document',
];

// Frees the name "invoice" for the ERP sales invoice (#223); rows and identity are kept.
export class ProformaInvoiceRename1791488000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoice" RENAME TO "proforma_invoice"`);
        await queryRunner.query(
            `ALTER SEQUENCE IF EXISTS "invoice_id_seq" RENAME TO "proforma_invoice_id_seq"`,
        );
        for (const table of LINK_TABLES) {
            await queryRunner.query(
                `ALTER TABLE "${table}" RENAME COLUMN "invoiceId" TO "proformaInvoiceId"`,
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const table of LINK_TABLES) {
            await queryRunner.query(
                `ALTER TABLE "${table}" RENAME COLUMN "proformaInvoiceId" TO "invoiceId"`,
            );
        }
        await queryRunner.query(
            `ALTER SEQUENCE IF EXISTS "proforma_invoice_id_seq" RENAME TO "invoice_id_seq"`,
        );
        await queryRunner.query(`ALTER TABLE "proforma_invoice" RENAME TO "invoice"`);
    }
}
