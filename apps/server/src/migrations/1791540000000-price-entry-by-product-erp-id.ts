import { MigrationInterface, QueryRunner } from 'typeorm';

// #297: a price entry is keyed by the product's ERP id so a price can be stored before its product arrives.
export class PriceEntryByProductErpId1791540000000 implements MigrationInterface {
    name = 'PriceEntryByProductErpId1791540000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "product_variant_price_entry" ADD "productExternalId" character varying`,
        );
        await queryRunner.query(
            `UPDATE "product_variant_price_entry" e SET "productExternalId" = p."customFieldsExternalid"
               FROM "product_variant" pv JOIN "product" p ON p."id" = pv."productId"
              WHERE pv."id"::varchar = e."variantId"`,
        );
        await queryRunner.query(
            `DELETE FROM "product_variant_price_entry" WHERE "productExternalId" IS NULL`,
        );
        await queryRunner.query(
            `DELETE FROM "product_variant_price_entry" a USING "product_variant_price_entry" b
              WHERE a."productExternalId" = b."productExternalId" AND a."priceTypeCode" = b."priceTypeCode" AND a."id" < b."id"`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_price_entry" ALTER COLUMN "productExternalId" SET NOT NULL`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_ddee21f1a63880aa171f305bc5" ON "product_variant_price_entry" ("productExternalId", "priceTypeCode")`,
        );
        await queryRunner.query(`DROP INDEX "IDX_94d191d8ddc46b70764a3ab283"`);
        await queryRunner.query(
            `ALTER TABLE "product_variant_price_entry" DROP COLUMN "variantId"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "product_variant_price_entry" ADD "variantId" character varying`,
        );
        await queryRunner.query(
            `UPDATE "product_variant_price_entry" e SET "variantId" = v.id::varchar
               FROM (SELECT p."customFieldsExternalid" AS ext, MIN(pv."id") AS id
                       FROM "product" p JOIN "product_variant" pv ON pv."productId" = p."id"
                      GROUP BY p."customFieldsExternalid") v
              WHERE v.ext = e."productExternalId"`,
        );
        await queryRunner.query(
            `DELETE FROM "product_variant_price_entry" WHERE "variantId" IS NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_price_entry" ALTER COLUMN "variantId" SET NOT NULL`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_94d191d8ddc46b70764a3ab283" ON "product_variant_price_entry" ("variantId", "priceTypeCode")`,
        );
        await queryRunner.query(`DROP INDEX "IDX_ddee21f1a63880aa171f305bc5"`);
        await queryRunner.query(
            `ALTER TABLE "product_variant_price_entry" DROP COLUMN "productExternalId"`,
        );
    }
}
