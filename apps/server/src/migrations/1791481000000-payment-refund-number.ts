import { MigrationInterface, QueryRunner } from 'typeorm';

// Backfills existing rows with a sequence-derived placeholder — local/integration contours only,
// per AGENTS.md's "test/dev data, migrate freely" decision (docs/identifiers.md #207).
export class PaymentRefundNumber1791481000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "payment_refund" ADD "number" character varying`,
            undefined,
        );
        await queryRunner.query(
            `UPDATE "payment_refund" SET "number" = nextval('mivend_number_seq_refund')::text WHERE "number" IS NULL`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "payment_refund" ALTER COLUMN "number" SET NOT NULL`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_payment_refund_number" ON "payment_refund" ("number")`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_payment_refund_number"`, undefined);
        await queryRunner.query(`ALTER TABLE "payment_refund" DROP COLUMN "number"`, undefined);
    }
}
