import { MigrationInterface, QueryRunner } from 'typeorm';

// Persisted display values that still said "Invoice" after #223 (offline-terms method name, reconciliation messages, in-flight inbox payload key).
export class ProformaInvoiceLeftoverValues1791491000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "payment_method_translation" SET "name" = 'ProformaInvoice / deferred payment' WHERE "name" = 'Invoice / deferred payment'`,
        );
        await queryRunner.query(
            `UPDATE "notification" SET "message" = replace("message", '(invoice ', '(proforma invoice ') WHERE "message" LIKE '%(invoice %'`,
        );
        await queryRunner.query(
            `UPDATE "incoming_payment_event" SET "payload" = replace("payload", '"invoiceId":', '"proformaInvoiceId":') WHERE "status" IN ('pending', 'processing') AND "payload" LIKE '%"invoiceId":%'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "notification" SET "message" = replace("message", '(proforma invoice ', '(invoice ') WHERE "message" LIKE '%(proforma invoice %'`,
        );
        await queryRunner.query(
            `UPDATE "payment_method_translation" SET "name" = 'Invoice / deferred payment' WHERE "name" = 'ProformaInvoice / deferred payment'`,
        );
    }
}
