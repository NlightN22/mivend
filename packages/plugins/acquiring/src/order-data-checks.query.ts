type Query = (sql: string, params: unknown[]) => Promise<Array<{ lineId: string; sku: string }>>;

// A line is without an organization when neither its stamped value nor its variant has one.
export function findLinesWithoutOrganization(query: Query, orderId: string) {
    return query(
        `SELECT l.id::text AS "lineId", v.sku FROM order_line l
         INNER JOIN product_variant v ON v.id = l."productVariantId"
         WHERE l."orderId" = $1
           AND l."customFieldsOrganizationid" IS NULL
           AND v."customFieldsOrganizationid" IS NULL
         ORDER BY l.id`,
        [orderId],
    );
}
