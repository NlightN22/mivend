import { MigrationInterface, QueryRunner } from 'typeorm';

// #254: ERP-owned claims, corrections and change results stored as received (header and line tables, no foreign keys).
export class ErpOrderDocuments1791555000000 implements MigrationInterface {
    name = 'ErpOrderDocuments1791555000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "customer_claim_erp" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "sourceVersion" character varying NOT NULL, "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE, "isDeleted" boolean NOT NULL DEFAULT false, "number" character varying NOT NULL DEFAULT '', "date" TIMESTAMP WITH TIME ZONE, "organizationId" character varying, "counterpartyId" character varying, "contractId" character varying, "departmentId" character varying, "responsibleId" character varying, "projectId" character varying, "warehouseId" character varying, "orderId" character varying, "basisDocument" jsonb, "currency" character varying, "exchangeRate" double precision, "exchangeMultiplicity" double precision, "priceTypeId" character varying, "salesConditionId" character varying, "discountCardId" character varying, "vatAccounted" boolean, "amountIncludesVat" boolean, "totalAmountMinor" bigint NOT NULL DEFAULT '0', "totalWeight" double precision, "comment" text, "status" jsonb, "hasClaim" boolean, "workedOut" boolean, "receiptKind" jsonb, "saleWasChanged" boolean, "saleDocumentsUpdatePending" boolean, "transferDocument" jsonb, "goodsTransferDocument" jsonb, "supplierClaimDocument" jsonb, "internalMovementDocument" jsonb, CONSTRAINT "PK_dddc2fa20ada54fc8a58756be64" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_customer_claim_erp_counterparty" ON "customer_claim_erp" ("counterpartyId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_customer_claim_erp_order" ON "customer_claim_erp" ("orderId") `,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_customer_claim_erp_erp_id" ON "customer_claim_erp" ("erpId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "customer_claim_goods_line_erp" ("id" SERIAL NOT NULL, "documentId" integer NOT NULL, "lineNumber" integer NOT NULL, "linkKey" integer, "rowKey" integer, "productId" character varying, "characteristicId" character varying, "seriesId" character varying, "unitId" character varying, "unitCoefficient" double precision, "placesUnitId" character varying, "places" double precision, "quantity" double precision NOT NULL DEFAULT '0', "priceMinor" bigint NOT NULL DEFAULT '0', "amountMinor" bigint NOT NULL DEFAULT '0', "vatCode" character varying, "vatAmountMinor" bigint, "weight" double precision, "quality" jsonb, "warehouseId" character varying, "returnDocument" jsonb, "hasClaim" boolean, "returnReason" jsonb, "decision" jsonb, "comment" text, "inventoryDocumentId" character varying, "automaticDiscountPercent" double precision, "manualDiscountPercent" double precision, "orderId" character varying, "saleDocumentId" character varying, "receiptOrderId" character varying, "costMinor" bigint, "batchDocument" jsonb, "lineStatus" character varying, "transferredTo" jsonb, "refusalReason" character varying, CONSTRAINT "PK_057f92c114ff3c6baf8d2b81ac9" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_customer_claim_goods_line_erp_document" ON "customer_claim_goods_line_erp" ("documentId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "customer_claim_service_line_erp" ("id" SERIAL NOT NULL, "documentId" integer NOT NULL, "lineNumber" integer NOT NULL, "productId" character varying, "content" text, "quantity" double precision NOT NULL DEFAULT '0', "priceMinor" bigint NOT NULL DEFAULT '0', "amountMinor" bigint NOT NULL DEFAULT '0', "vatCode" character varying, "vatAmountMinor" bigint, "automaticDiscountPercent" double precision, "manualDiscountPercent" double precision, "orderId" character varying, "returnReason" jsonb, "comment" text, "decision" jsonb, "hasClaim" boolean, "saleDocumentId" character varying, CONSTRAINT "PK_4617d950fbca317261ba43874fd" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_customer_claim_service_line_erp_document" ON "customer_claim_service_line_erp" ("documentId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "sales_correction_erp" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "sourceVersion" character varying NOT NULL, "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE, "isDeleted" boolean NOT NULL DEFAULT false, "number" character varying NOT NULL DEFAULT '', "date" TIMESTAMP WITH TIME ZONE, "operationKind" jsonb, "correctedDocument" jsonb, "basisDocument" jsonb, "orderId" character varying, "counterpartyId" character varying, "contractId" character varying, "organizationId" character varying, "departmentId" character varying, "warehouseId" character varying, "responsibleId" character varying, "project" jsonb, "currency" character varying, "exchangeRate" double precision, "exchangeMultiplicity" double precision, "totalAmountMinor" bigint NOT NULL DEFAULT '0', "vatAccounted" boolean, "amountIncludesVat" boolean, "correctVat" boolean, "correctAccountingAndTax" boolean, "priceTypeId" character varying, "salesCondition" jsonb, "discountCard" jsonb, "deliveryAddress" text, "deliveryAddressAddition" text, "consignorId" character varying, "consigneeId" character varying, "bankAccountId" character varying, "transferKind" jsonb, "comment" text, "accounting" jsonb, "setComponents" jsonb NOT NULL DEFAULT '[]', "serialNumbers" jsonb NOT NULL DEFAULT '[]', "setSerialNumbers" jsonb NOT NULL DEFAULT '[]', "packageBarcodes" jsonb NOT NULL DEFAULT '[]', "traceability" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_21a61870ec511eff376d49907be" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_sales_correction_erp_counterparty" ON "sales_correction_erp" ("counterpartyId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_sales_correction_erp_order" ON "sales_correction_erp" ("orderId") `,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_sales_correction_erp_erp_id" ON "sales_correction_erp" ("erpId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "sales_correction_goods_line_erp" ("id" SERIAL NOT NULL, "documentId" integer NOT NULL, "lineNumber" integer NOT NULL, "lineId" character varying, "productId" character varying, "characteristicId" character varying, "seriesId" character varying, "unitId" character varying, "unitCoefficient" double precision NOT NULL DEFAULT '0', "quantity" double precision NOT NULL DEFAULT '0', "priceMinor" bigint NOT NULL DEFAULT '0', "amountMinor" bigint NOT NULL DEFAULT '0', "vatCode" character varying, "vatAmountMinor" bigint, "quantityBeforeCorrection" double precision, "priceBeforeCorrectionMinor" bigint, "amountBeforeCorrectionMinor" bigint, "vatAmountBeforeCorrectionMinor" bigint, "quantityBeforeChange" double precision, "priceBeforeChangeMinor" bigint, "amountBeforeChangeMinor" bigint, "vatAmountBeforeChangeMinor" bigint, "vatCodeBeforeChange" character varying, "manualDiscountPercent" double precision, "automaticDiscountPercent" double precision, "automaticDiscountCondition" jsonb, "automaticDiscountConditionValue" character varying, "orderId" character varying, "warehouseId" character varying, "quality" jsonb, "writeOffMethod" jsonb, "inSaleDocument" boolean, "reflectInStock" boolean, "traceable" boolean, "belongsTo" character varying, "originCountry" jsonb, "customsCode" jsonb, "customsCodeBeforeChange" jsonb, "placesUnitId" character varying, "placesQuantity" double precision, "linkKey" integer, "rowKey" integer, "shippedDelta" double precision NOT NULL DEFAULT '0', CONSTRAINT "PK_67fd7736822bd59128716511db9" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_sales_correction_goods_line_erp_document" ON "sales_correction_goods_line_erp" ("documentId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "sales_correction_service_line_erp" ("id" SERIAL NOT NULL, "documentId" integer NOT NULL, "lineNumber" integer NOT NULL, "productId" character varying, "content" text, "contentBeforeChange" text, "quantity" double precision NOT NULL DEFAULT '0', "priceMinor" bigint NOT NULL DEFAULT '0', "amountMinor" bigint NOT NULL DEFAULT '0', "vatCode" character varying, "vatAmountMinor" bigint, "quantityBeforeCorrection" double precision, "priceBeforeCorrectionMinor" bigint, "amountBeforeCorrectionMinor" bigint, "vatAmountBeforeCorrectionMinor" bigint, "quantityBeforeChange" double precision, "priceBeforeChangeMinor" bigint, "amountBeforeChangeMinor" bigint, "vatAmountBeforeChangeMinor" bigint, "vatCodeBeforeChange" character varying, "manualDiscountPercent" double precision, "automaticDiscountPercent" double precision, "automaticDiscountCondition" jsonb, "automaticDiscountConditionValue" character varying, "orderId" character varying, "inSaleDocument" boolean, "reflectInStock" boolean, CONSTRAINT "PK_d215065a9fbd398180f54d6a228" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_sales_correction_service_line_erp_document" ON "sales_correction_service_line_erp" ("documentId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "order_correction_erp" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "sourceVersion" character varying NOT NULL, "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE, "isDeleted" boolean NOT NULL DEFAULT false, "number" character varying NOT NULL DEFAULT '', "date" TIMESTAMP WITH TIME ZONE, "orderId" character varying, "counterpartyId" character varying, "organizationId" character varying, "responsibleId" character varying, "priceTypeId" character varying, "vatAccounted" boolean, "amountIncludesVat" boolean, "exchangeRate" double precision, "exchangeMultiplicity" double precision, "totalAmountMinor" bigint NOT NULL DEFAULT '0', "comment" text, "discountCard" jsonb, "salesCondition" jsonb, "structuralUnit" jsonb, "plannedCostTotalMinor" bigint, "usePlannedCost" boolean, "accounting" jsonb, CONSTRAINT "PK_7c733f932a7bd13d4af584e2af3" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_correction_erp_counterparty" ON "order_correction_erp" ("counterpartyId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_correction_erp_order" ON "order_correction_erp" ("orderId") `,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_order_correction_erp_erp_id" ON "order_correction_erp" ("erpId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "order_correction_goods_line_erp" ("id" SERIAL NOT NULL, "documentId" integer NOT NULL, "lineNumber" integer NOT NULL, "productId" character varying, "characteristicId" character varying, "seriesId" character varying, "unitId" character varying, "unitCoefficient" double precision, "quantity" double precision NOT NULL DEFAULT '0', "placesUnitId" character varying, "placesQuantity" double precision, "priceMinor" bigint NOT NULL DEFAULT '0', "amountMinor" bigint NOT NULL DEFAULT '0', "vatCode" character varying, "vatAmountMinor" bigint, "manualDiscountPercent" double precision, "automaticDiscountPercent" double precision, "automaticDiscountCondition" jsonb, "automaticDiscountConditionValue" character varying, "placement" jsonb, "plannedCostMinor" bigint, CONSTRAINT "PK_10ce8c4a85b30904a2e09e8897f" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_correction_goods_line_erp_document" ON "order_correction_goods_line_erp" ("documentId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "order_correction_service_line_erp" ("id" SERIAL NOT NULL, "documentId" integer NOT NULL, "lineNumber" integer NOT NULL, "productId" character varying, "content" text, "quantity" double precision NOT NULL DEFAULT '0', "priceMinor" bigint NOT NULL DEFAULT '0', "amountMinor" bigint NOT NULL DEFAULT '0', "vatCode" character varying, "vatAmountMinor" bigint, "manualDiscountPercent" double precision, "automaticDiscountPercent" double precision, "automaticDiscountCondition" jsonb, "automaticDiscountConditionValue" character varying, CONSTRAINT "PK_bb63ebe803ae632ab2a65daac69" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_correction_service_line_erp_document" ON "order_correction_service_line_erp" ("documentId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "order_correction_container_line_erp" ("id" SERIAL NOT NULL, "documentId" integer NOT NULL, "lineNumber" integer NOT NULL, "productId" character varying, "quantity" double precision NOT NULL DEFAULT '0', "priceMinor" bigint NOT NULL DEFAULT '0', "amountMinor" bigint NOT NULL DEFAULT '0', "placement" jsonb, CONSTRAINT "PK_9163cab53906229e9e7b7e30033" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_correction_container_line_erp_document" ON "order_correction_container_line_erp" ("documentId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "order_change_result_erp" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "sourceVersion" character varying NOT NULL, "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE, "isDeleted" boolean NOT NULL DEFAULT false, "requestId" character varying, "orderId" character varying, "status" character varying NOT NULL DEFAULT '', "rejectionCode" character varying, "rejectionMessage" text, CONSTRAINT "PK_ccf6199ff665b2bd903b48e75da" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_change_result_erp_order" ON "order_change_result_erp" ("orderId") `,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_order_change_result_erp_erp_id" ON "order_change_result_erp" ("erpId") `,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_customer_claim_erp_counterparty"`);
        await queryRunner.query(`DROP INDEX "IDX_customer_claim_erp_order"`);
        await queryRunner.query(`DROP INDEX "IDX_customer_claim_erp_erp_id"`);
        await queryRunner.query(`DROP TABLE "customer_claim_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_customer_claim_goods_line_erp_document"`);
        await queryRunner.query(`DROP TABLE "customer_claim_goods_line_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_customer_claim_service_line_erp_document"`);
        await queryRunner.query(`DROP TABLE "customer_claim_service_line_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_sales_correction_erp_counterparty"`);
        await queryRunner.query(`DROP INDEX "IDX_sales_correction_erp_order"`);
        await queryRunner.query(`DROP INDEX "IDX_sales_correction_erp_erp_id"`);
        await queryRunner.query(`DROP TABLE "sales_correction_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_sales_correction_goods_line_erp_document"`);
        await queryRunner.query(`DROP TABLE "sales_correction_goods_line_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_sales_correction_service_line_erp_document"`);
        await queryRunner.query(`DROP TABLE "sales_correction_service_line_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_order_correction_erp_counterparty"`);
        await queryRunner.query(`DROP INDEX "IDX_order_correction_erp_order"`);
        await queryRunner.query(`DROP INDEX "IDX_order_correction_erp_erp_id"`);
        await queryRunner.query(`DROP TABLE "order_correction_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_order_correction_goods_line_erp_document"`);
        await queryRunner.query(`DROP TABLE "order_correction_goods_line_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_order_correction_service_line_erp_document"`);
        await queryRunner.query(`DROP TABLE "order_correction_service_line_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_order_correction_container_line_erp_document"`);
        await queryRunner.query(`DROP TABLE "order_correction_container_line_erp"`);
        await queryRunner.query(`DROP INDEX "IDX_order_change_result_erp_order"`);
        await queryRunner.query(`DROP INDEX "IDX_order_change_result_erp_erp_id"`);
        await queryRunner.query(`DROP TABLE "order_change_result_erp"`);
    }
}
