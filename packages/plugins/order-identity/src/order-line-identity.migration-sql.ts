export type SqlRunner = (sql: string) => Promise<unknown[]>;

export interface OrderLineIdentityMigrationResult {
    mergedLines: number;
}

// Names match TypeORM's DefaultNamingStrategy for OrderLineIdentity, so synchronize sees no diff.
const CREATE_TABLE = [
    `CREATE TABLE IF NOT EXISTS "order_line_identity" ("orderLineId" integer NOT NULL, "uuid" uuid NOT NULL, ` +
        `CONSTRAINT "PK_d4bcb8ed500e90728a2c8609203" PRIMARY KEY ("orderLineId"))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_645acce6c90062648400a344b3" ON "order_line_identity" ("uuid")`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'order_line_identity'::regclass AND contype = 'f') THEN ` +
        `ALTER TABLE "order_line_identity" ADD CONSTRAINT "FK_d4bcb8ed500e90728a2c8609203" FOREIGN KEY ("orderLineId") ` +
        `REFERENCES "order_line"("id") ON DELETE CASCADE ON UPDATE NO ACTION; END IF; END $$`,
];

const COPY_UUIDS =
    `INSERT INTO "order_line_identity" ("orderLineId", "uuid") ` +
    `SELECT "id", "customFieldsUuid"::uuid FROM "order_line" WHERE "customFieldsUuid" IS NOT NULL ` +
    `ON CONFLICT ("orderLineId") DO NOTHING`;

const BACKFILL_MISSING =
    `INSERT INTO "order_line_identity" ("orderLineId", "uuid") ` +
    `SELECT ol."id", gen_random_uuid() FROM "order_line" ol ` +
    `WHERE NOT EXISTS (SELECT 1 FROM "order_line_identity" i WHERE i."orderLineId" = ol."id")`;

// Duplicates Vendure would have merged (same variant and line custom fields) in carts only. A group
// is merged only at one list price and without adjustments, so the stored order totals stay exact.
const MERGE_DUPLICATE_LINES = `
WITH ranked AS (
    SELECT ol."id",
        row_number() OVER ordered AS rn,
        count(*) OVER grp AS n,
        sum(ol."quantity") OVER grp AS total,
        min(ol."listPrice") OVER grp AS min_price,
        max(ol."listPrice") OVER grp AS max_price,
        bool_and(ol."adjustments" = '[]') OVER grp AS plain
    FROM "order_line" ol
    JOIN "order" o ON o."id" = ol."orderId"
    WHERE o."state" = 'AddingItems'
    WINDOW grp AS (PARTITION BY ol."orderId", ol."productVariantId", ol."customFieldsOrganizationid",
                       ol."customFieldsManualunitprice", ol."customFieldsManualpricereason"),
           ordered AS (grp ORDER BY ol."createdAt", ol."id")
), eligible AS (
    SELECT * FROM ranked WHERE n > 1 AND min_price = max_price AND plain
), kept AS (
    UPDATE "order_line" ol SET "quantity" = e.total FROM eligible e WHERE ol."id" = e."id" AND e.rn = 1
    RETURNING ol."id"
), removed AS (
    DELETE FROM "order_line" ol USING eligible e WHERE ol."id" = e."id" AND e.rn > 1 RETURNING ol."id"
)
SELECT (SELECT count(*) FROM removed)::int AS "mergedLines", (SELECT count(*) FROM kept)::int AS "keptLines"`;

// Shared by the production migration and the synchronize-contour startup step; idempotent.
export async function migrateOrderLineIdentity(
    run: SqlRunner,
): Promise<OrderLineIdentityMigrationResult> {
    for (const sql of CREATE_TABLE) await run(sql);
    await run(COPY_UUIDS);
    await run(BACKFILL_MISSING);
    const [row] = (await run(MERGE_DUPLICATE_LINES)) as Array<{ mergedLines: number }>;
    return { mergedLines: row?.mergedLines ?? 0 };
}
