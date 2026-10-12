import { MigrationInterface, QueryRunner } from 'typeorm';

// #222: labels payments migrated from the removed deferred method (no placement, no split) so they are never
// settled by "payment received", and cleans the bank-transfer method name. Irreversible.
export class LegacyDeferredPaymentLabel1791494000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "payment"
             SET "metadata" = (COALESCE("metadata"::jsonb, '{}'::jsonb) || '{"origin":"legacy-deferred"}'::jsonb)::text
             WHERE "method" = 'offline-terms'
               AND NOT (COALESCE("metadata"::jsonb, '{}'::jsonb) ? 'placement')
               AND NOT (COALESCE("metadata"::jsonb, '{}'::jsonb) ? 'proformaInvoices')
               AND NOT (COALESCE("metadata"::jsonb, '{}'::jsonb) ? 'origin')`,
        );
        await queryRunner.query(
            `UPDATE "payment_method_translation" SET "name" = 'Bank transfer'
             WHERE "baseId" IN (SELECT "id" FROM "payment_method" WHERE "code" = 'offline-terms')
               AND ("name" ILIKE '%deferred payment%' OR "name" LIKE 'ProformaInvoice /%')`,
        );
    }

    public async down(): Promise<void> {
        // Irreversible: the legacy origin cannot be told apart from other payments once the label is gone.
    }
}
