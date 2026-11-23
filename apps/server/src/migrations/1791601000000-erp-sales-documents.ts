import { MigrationInterface, QueryRunner } from 'typeorm';

export class ErpSalesDocuments1791601000000 implements MigrationInterface {
    name = 'ErpSalesDocuments1791601000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "erp_sales_document" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "sourceVersion" character varying NOT NULL, "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE, "isDeleted" boolean NOT NULL DEFAULT false, "kind" character varying NOT NULL, "number" character varying NOT NULL DEFAULT '', "date" TIMESTAMP WITH TIME ZONE, "posted" boolean NOT NULL DEFAULT false, "deletionMarked" boolean NOT NULL DEFAULT false, "counterpartyId" character varying, "contractId" character varying, "organizationId" character varying, "dealId" character varying, "dealType" character varying, "basisDocumentId" character varying, "customerOrderId" character varying, "currency" character varying, "totalAmountMinor" bigint, "amountIncludesVat" boolean, "truncated" boolean NOT NULL DEFAULT false, "rowCounts" jsonb, "attributes" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_0380b5b518c1af86cec1c7d4fc6" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_3fcd5d52fd6be98a2cc443ddb4" ON "erp_sales_document" ("erpId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cc8077071db740e43641bb9b66" ON "erp_sales_document" ("dealId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_2b39e17edb8e779878af1a53f3" ON "erp_sales_document" ("basisDocumentId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_ac76304896db1f096ea04e5ba3" ON "erp_sales_document" ("customerOrderId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "erp_sales_document_line" ("id" SERIAL NOT NULL, "documentId" integer NOT NULL, "lineNumber" integer NOT NULL, "part" character varying NOT NULL, "linkedId" character varying, "productId" character varying, "quantity" double precision, "coefficient" double precision, "amountMinor" bigint, "vatAmountMinor" bigint, "attributes" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_818da2a96f3304940beff4d5715" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_10a732f23f0455bcc691facfae" ON "erp_sales_document_line" ("documentId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7110a088b439b5e5d08af84e83" ON "erp_sales_document_line" ("linkedId") `,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "erp_sales_document_line"`);
        await queryRunner.query(`DROP TABLE "erp_sales_document"`);
    }
}
