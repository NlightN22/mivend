import { MigrationInterface, QueryRunner } from 'typeorm';

// Issue #101: GrantedDiscount (@mivend/plugin-price-entry) — shipment-time discount facts.
export class AddGrantedDiscountTable1790743000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "granted_discount" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "sourceDocumentId" character varying NOT NULL, "counterpartyErpId" character varying NOT NULL, "productErpId" character varying NOT NULL, "orderEntityId" character varying, "discountDocumentId" character varying, "discountRuleRecipientId" character varying NOT NULL, "condition" character varying, "discountAmount" double precision NOT NULL, "sourceVersion" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_granted_discount_id" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_granted_discount_erpId" ON "granted_discount" ("erpId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_granted_discount_counterpartyErpId" ON "granted_discount" ("counterpartyErpId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_granted_discount_orderEntityId" ON "granted_discount" ("orderEntityId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "granted_discount"`);
    }
}
