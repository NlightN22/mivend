import { MigrationInterface, QueryRunner } from 'typeorm';

// #222 stage 2a: deferred is no longer a payment form. Its payments become bank-transfer payments (still
// unpaid, so they keep occupying the limit); the method row and the reservation classification fields go.
export class DeferredPaymentMethodRemoval1791493000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "payment" SET "method" = 'offline-terms' WHERE "method" = 'deferred-payment'`,
        );
        const legacy = `(SELECT "id" FROM "payment_method" WHERE "code" = 'deferred-payment')`;
        await queryRunner.query(
            `DELETE FROM "payment_method_channels_channel" WHERE "paymentMethodId" IN ${legacy}`,
        );
        await queryRunner.query(
            `DELETE FROM "payment_method_translation" WHERE "baseId" IN ${legacy}`,
        );
        await queryRunner.query(`DELETE FROM "payment_method" WHERE "code" = 'deferred-payment'`);
        await queryRunner.query(
            `UPDATE "payment_method_translation" SET "name" = 'Bank transfer' WHERE "name" = 'ProformaInvoice / deferred payment'`,
        );
        await queryRunner.query(
            `ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "customFieldsPaymentclassification"`,
        );
        await queryRunner.query(
            `ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "customFieldsReservationttldays"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "payment_method" ADD COLUMN IF NOT EXISTS "customFieldsPaymentclassification" varchar`,
        );
        await queryRunner.query(
            `ALTER TABLE "payment_method" ADD COLUMN IF NOT EXISTS "customFieldsReservationttldays" integer`,
        );
        await queryRunner.query(
            `UPDATE "payment_method_translation" SET "name" = 'ProformaInvoice / deferred payment' WHERE "name" = 'Bank transfer'`,
        );
    }
}
