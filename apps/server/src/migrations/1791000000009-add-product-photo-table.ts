import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductPhotoTable1791000000009 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "product_photo" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "externalId" character varying NOT NULL, "productExternalId" character varying NOT NULL, "contentHash" character varying, "mimeType" character varying, "position" integer NOT NULL DEFAULT '0', "downloadUrl" text, "downloadUrlExpiresAt" TIMESTAMP, "isDeleted" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL DEFAULT 'pending', "assetId" character varying, "syncQueuedAt" TIMESTAMP, "replayAttempts" integer NOT NULL DEFAULT '0', "lastReplayAt" TIMESTAMP, "lastError" text, "id" SERIAL NOT NULL, CONSTRAINT "PK_product_photo_id" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_product_photo_external_id" ON "product_photo" ("externalId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_product_photo_content_hash" ON "product_photo" ("contentHash") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_product_photo_product_external_id" ON "product_photo" ("productExternalId") `,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "public"."IDX_product_photo_product_external_id"`,
            undefined,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_product_photo_external_id"`, undefined);
        await queryRunner.query(`DROP TABLE "product_photo"`, undefined);
    }
}
