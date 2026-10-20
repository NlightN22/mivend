import { MigrationInterface, QueryRunner } from 'typeorm';

// #260: contract payment proformas have no order; idempotency key per counterparty.
export class ContractProformaInvoice1791531000000 implements MigrationInterface {
    name = 'ContractProformaInvoice1791531000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "proforma_invoice" ALTER COLUMN "orderId" DROP NOT NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "proforma_invoice" ADD "contractId" character varying, ADD "contractName" character varying, ADD "idempotencyKey" character varying`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_proforma_invoice_idempotency" ON "proforma_invoice" ("counterpartyId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_proforma_invoice_idempotency"`);
        await queryRunner.query(
            `ALTER TABLE "proforma_invoice" DROP COLUMN "idempotencyKey", DROP COLUMN "contractName", DROP COLUMN "contractId"`,
        );
        await queryRunner.query(`DELETE FROM "proforma_invoice" WHERE "orderId" IS NULL`);
        await queryRunner.query(
            `ALTER TABLE "proforma_invoice" ALTER COLUMN "orderId" SET NOT NULL`,
        );
    }
}
