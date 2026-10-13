import { MigrationInterface, QueryRunner } from 'typeorm';

// #224: ERP-owned settlement documents (receivables history) and per-triple balance facts.
export class SettlementDocuments1791498000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "settlement_document" (
                "id" SERIAL NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "erpId" character varying NOT NULL,
                "documentType" character varying NOT NULL,
                "documentTypeLabel" character varying NOT NULL,
                "number" character varying NOT NULL,
                "date" TIMESTAMP WITH TIME ZONE NOT NULL,
                "isDeleted" boolean NOT NULL DEFAULT false,
                "sourceVersion" character varying NOT NULL,
                "isErpOwned" boolean NOT NULL DEFAULT true,
                CONSTRAINT "PK_settlement_document" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_settlement_document_erp_id"
               ON "settlement_document" ("erpId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_document_date"
               ON "settlement_document" ("date")`,
        );
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "settlement_document_entry" (
                "id" SERIAL NOT NULL,
                "documentId" integer NOT NULL,
                "organizationErpId" character varying NOT NULL,
                "counterpartyErpId" character varying NOT NULL,
                "contractErpId" character varying NOT NULL,
                "counterpartyId" character varying,
                "contractId" character varying,
                "currency" character varying NOT NULL,
                "amountMinor" bigint NOT NULL,
                "dueDate" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_settlement_document_entry" PRIMARY KEY ("id"),
                CONSTRAINT "FK_settlement_document_entry_document" FOREIGN KEY ("documentId")
                    REFERENCES "settlement_document" ("id") ON DELETE CASCADE
            )`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_entry_document"
               ON "settlement_document_entry" ("documentId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_entry_scope"
               ON "settlement_document_entry" ("counterpartyId", "contractId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_entry_triple"
               ON "settlement_document_entry" ("organizationErpId", "counterpartyErpId", "contractErpId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_entry_pending_counterparty"
               ON "settlement_document_entry" ("counterpartyErpId") WHERE "counterpartyId" IS NULL`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_entry_pending_contract"
               ON "settlement_document_entry" ("contractErpId") WHERE "contractId" IS NULL`,
        );
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "settlement_order_link" (
                "id" SERIAL NOT NULL,
                "entryId" integer NOT NULL,
                "orderErpId" character varying NOT NULL,
                "orderUuid" character varying,
                "orderId" integer,
                "amountMinor" bigint NOT NULL,
                CONSTRAINT "PK_settlement_order_link" PRIMARY KEY ("id"),
                CONSTRAINT "FK_settlement_order_link_entry" FOREIGN KEY ("entryId")
                    REFERENCES "settlement_document_entry" ("id") ON DELETE CASCADE
            )`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_order_link_entry"
               ON "settlement_order_link" ("entryId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_order_link_order"
               ON "settlement_order_link" ("orderId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_order_link_pending"
               ON "settlement_order_link" ("orderErpId") WHERE "orderId" IS NULL`,
        );
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "settlement_balance" (
                "id" SERIAL NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "balanceKey" character varying NOT NULL,
                "organizationErpId" character varying NOT NULL,
                "counterpartyErpId" character varying NOT NULL,
                "contractErpId" character varying NOT NULL,
                "counterpartyId" character varying,
                "contractId" character varying,
                "currency" character varying NOT NULL,
                "openingDate" TIMESTAMP WITH TIME ZONE,
                "openingBalance" bigint NOT NULL,
                "closingBalance" bigint NOT NULL,
                "isDeleted" boolean NOT NULL DEFAULT false,
                "sourceVersion" character varying NOT NULL,
                CONSTRAINT "PK_settlement_balance" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_settlement_balance_key"
               ON "settlement_balance" ("balanceKey")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_balance_scope"
               ON "settlement_balance" ("counterpartyId", "contractId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_balance_pending_counterparty"
               ON "settlement_balance" ("counterpartyErpId") WHERE "counterpartyId" IS NULL`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_balance_pending_contract"
               ON "settlement_balance" ("contractErpId") WHERE "contractId" IS NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "global_settings"
               ADD COLUMN IF NOT EXISTS "customFieldsSettlementretentionmonths" integer DEFAULT '12'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings" DROP COLUMN IF EXISTS "customFieldsSettlementretentionmonths"`,
        );
        await queryRunner.query(`DROP TABLE IF EXISTS "settlement_balance"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "settlement_order_link"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "settlement_document_entry"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "settlement_document"`);
    }
}
