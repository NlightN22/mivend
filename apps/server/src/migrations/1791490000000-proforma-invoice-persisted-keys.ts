import { MigrationInterface, QueryRunner } from 'typeorm';

// Renames persisted keys that still said "invoice" after #223: document type, numbering
// sequence, ReadInvoice permission in role rows and the access-scope key.
export class ProformaInvoicePersistedKeys1791490000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "document" SET "type" = 'proforma-invoice' WHERE "type" = 'invoice'`,
        );
        await queryRunner.query(
            `ALTER SEQUENCE IF EXISTS "mivend_number_seq_invoice" RENAME TO "mivend_number_seq_proforma_invoice"`,
        );
        await queryRunner.query(
            `UPDATE "role" SET "permissions" = regexp_replace("permissions", '\\mReadInvoice\\M', 'ReadProformaInvoice', 'g') WHERE "permissions" ~ '\\mReadInvoice\\M'`,
        );
        await queryRunner.query(
            `UPDATE "role_access_scope" SET "accessScopeConfig" = replace("accessScopeConfig", '"invoice":', '"proformaInvoice":') WHERE "accessScopeConfig" LIKE '%"invoice":%'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "role_access_scope" SET "accessScopeConfig" = replace("accessScopeConfig", '"proformaInvoice":', '"invoice":') WHERE "accessScopeConfig" LIKE '%"proformaInvoice":%'`,
        );
        await queryRunner.query(
            `UPDATE "role" SET "permissions" = regexp_replace("permissions", '\\mReadProformaInvoice\\M', 'ReadInvoice', 'g') WHERE "permissions" ~ '\\mReadProformaInvoice\\M'`,
        );
        await queryRunner.query(
            `ALTER SEQUENCE IF EXISTS "mivend_number_seq_proforma_invoice" RENAME TO "mivend_number_seq_invoice"`,
        );
        await queryRunner.query(
            `UPDATE "document" SET "type" = 'invoice' WHERE "type" = 'proforma-invoice'`,
        );
    }
}
