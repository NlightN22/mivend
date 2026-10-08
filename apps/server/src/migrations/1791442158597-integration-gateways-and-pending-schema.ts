import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationGatewaysAndPendingSchema1791442158597 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_product_photo_external_id"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_product_photo_content_hash"`, undefined);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_product_photo_product_external_id"`,
            undefined,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_bank_record_entity_id"`, undefined);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_bank_account_record_entity_id"`,
            undefined,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_bank_account_record_owner_id"`,
            undefined,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_region_record_entity_id"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_legal_form_record_entity_id"`, undefined);
        await queryRunner.query(
            `ALTER TABLE "global_settings" ADD "customFieldsAutoreserveonplacement" boolean DEFAULT false`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_outbox" ADD "first_failed_at" TIMESTAMP WITH TIME ZONE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_outbox" ADD "next_retry_at" TIMESTAMP WITH TIME ZONE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" ADD "outcome" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" ADD "outcome_reason" text`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "integration_inbox_event_noop" ON "integration_inbox_event" ("stream", "processed_at") WHERE "outcome" = 'noop'`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_4c735d7fc61bc055b83e5c2df6" ON "product_photo" ("externalId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_b1a923ebbda930c52a59978d13" ON "product_photo" ("productExternalId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_bf37b254d46cc3a1ad2cb816dc" ON "product_photo" ("contentHash") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_9fb05a369d302491ca8bcc79dd" ON "bank_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_4f1350be70e838ffe9857ed30f" ON "bank_account_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_52473f29f9eb60a712a485d5cb" ON "bank_account_record" ("ownerId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_56b462298e9c03f5191a20d9fb" ON "region_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_7254ec72495924f654c60e0074" ON "legal_form_record" ("entityId") `,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_7254ec72495924f654c60e0074"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_56b462298e9c03f5191a20d9fb"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_52473f29f9eb60a712a485d5cb"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_4f1350be70e838ffe9857ed30f"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_9fb05a369d302491ca8bcc79dd"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_bf37b254d46cc3a1ad2cb816dc"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_b1a923ebbda930c52a59978d13"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_4c735d7fc61bc055b83e5c2df6"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."integration_inbox_event_noop"`, undefined);
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" DROP COLUMN "outcome_reason"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" DROP COLUMN "outcome"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_outbox" DROP COLUMN "next_retry_at"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_outbox" DROP COLUMN "first_failed_at"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "global_settings" DROP COLUMN "customFieldsAutoreserveonplacement"`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_legal_form_record_entity_id" ON "legal_form_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_region_record_entity_id" ON "region_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_bank_account_record_owner_id" ON "bank_account_record" ("ownerId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_bank_account_record_entity_id" ON "bank_account_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_bank_record_entity_id" ON "bank_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_product_photo_product_external_id" ON "product_photo" ("productExternalId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_product_photo_content_hash" ON "product_photo" ("contentHash") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_product_photo_external_id" ON "product_photo" ("externalId") `,
            undefined,
        );
    }
}
