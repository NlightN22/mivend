import { MigrationInterface, QueryRunner } from 'typeorm';

// Issue #108: counterparty/contract-scoped ERP discount rules (DiscountRuleChanged) — a third
// trigger shape on the existing discount_rule table. See DiscountRule's own doc comment and
// docs/ai/erp-streams-map.md's "Discount rules" section.
export class AddDiscountRuleCounterpartyScope1790741701469 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "discount_rule" ADD "recipientType" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_rule" ADD "recipientErpId" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_rule" ADD "productErpId" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_rule" ADD "condition" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_rule" ADD "conditionValue" double precision`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_rule" ADD "limitAmount" double precision`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_rule" ADD "sourceVersion" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_rule" ADD "active" boolean NOT NULL DEFAULT true`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_rule" ALTER COLUMN "validTo" DROP NOT NULL`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reverting NOT NULL requires no existing NULL rows — acceptable for a down-migration,
        // same assumption every other nullable->non-nullable revert in this codebase makes.
        await queryRunner.query(
            `ALTER TABLE "discount_rule" ALTER COLUMN "validTo" SET NOT NULL`,
            undefined,
        );
        await queryRunner.query(`ALTER TABLE "discount_rule" DROP COLUMN "active"`, undefined);
        await queryRunner.query(
            `ALTER TABLE "discount_rule" DROP COLUMN "sourceVersion"`,
            undefined,
        );
        await queryRunner.query(`ALTER TABLE "discount_rule" DROP COLUMN "limitAmount"`, undefined);
        await queryRunner.query(
            `ALTER TABLE "discount_rule" DROP COLUMN "conditionValue"`,
            undefined,
        );
        await queryRunner.query(`ALTER TABLE "discount_rule" DROP COLUMN "condition"`, undefined);
        await queryRunner.query(
            `ALTER TABLE "discount_rule" DROP COLUMN "productErpId"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_rule" DROP COLUMN "recipientErpId"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_rule" DROP COLUMN "recipientType"`,
            undefined,
        );
    }
}
