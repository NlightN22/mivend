import { MigrationInterface, QueryRunner } from 'typeorm';

// #206: proforma invoice snapshot lines and versions; documents carry the proforma invoice's own number.
export class ProformaInvoiceVersions1791495000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "proforma_invoice"
               ADD COLUMN IF NOT EXISTS "lines" jsonb NOT NULL DEFAULT '[]',
               ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
               ADD COLUMN IF NOT EXISTS "supersedesId" integer,
               ADD COLUMN IF NOT EXISTS "supersededById" integer`,
        );
        await queryRunner.query(
            `UPDATE "proforma_invoice" pi
             SET "lines" = COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                     'variantId', ol."productVariantId",
                     'sku', pv."sku",
                     'name', COALESCE(
                         (SELECT t."name" FROM "product_variant_translation" t
                          WHERE t."baseId" = pv."id" ORDER BY (t."languageCode" = 'en') DESC, t."id" LIMIT 1),
                         pv."sku"),
                     'quantity', ol."quantity",
                     'unitPriceWithTax', u."unit",
                     'linePriceWithTax', u."unit" * ol."quantity",
                     'discounts', '[]'::jsonb) ORDER BY ol."id")
                 FROM "order_line" ol
                 JOIN "product_variant" pv ON pv."id" = ol."productVariantId"
                 CROSS JOIN LATERAL (SELECT CASE WHEN ol."listPriceIncludesTax" THEN ol."listPrice"
                     ELSE round(ol."listPrice" * (1 + COALESCE((
                         SELECT sum((tl->>'taxRate')::numeric) FROM jsonb_array_elements(ol."taxLines"::jsonb) tl
                     ), 0) / 100)) END::int AS "unit") u
                 WHERE ol."orderId" = pi."orderId"
                   AND ol."customFieldsOrganizationid" = pi."organizationId"
             ), '[]'::jsonb)
             WHERE pi."lines" = '[]'::jsonb`,
        );
        await queryRunner.query(
            `UPDATE "document" d SET "number" = pi."number"
             FROM "proforma_invoice" pi
             WHERE d."type" = 'proforma-invoice' AND d."proformaInvoiceId" = pi."id"::text
               AND d."number" <> pi."number"`,
        );
    }

    public async down(): Promise<void> {
        // Irreversible: snapshots and the corrected document numbers are not recomputed back.
    }
}
