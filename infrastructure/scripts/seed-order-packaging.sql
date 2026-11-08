-- #320: weight and volume on the variants of the demo order-card orders, as the ERP unit stream would write them
-- (the fields are read-only in the API). The last line of each order stays without data on purpose. Idempotent.
-- Run: psql -d <contour database> -f infrastructure/scripts/seed-order-packaging.sql
WITH ranked AS (
    SELECT l."productVariantId" AS variant_id,
           row_number() OVER (PARTITION BY l."orderId" ORDER BY l.id) AS pos,
           count(*) OVER (PARTITION BY l."orderId") AS total
    FROM order_line l
    JOIN "order" o ON o.id = l."orderId"
    WHERE o.code IN ('1000001487', '1000001488', '1000001489', '1000001490', '1000001471')
)
UPDATE product_variant v
SET "customFieldsUnitratiotobase" = 1,
    "customFieldsUnitweightkg" = 1.25 * r.pos,
    "customFieldsUnitvolumem3" = 0.004 * r.pos
FROM ranked r
WHERE v.id = r.variant_id AND (r.total = 1 OR r.pos < r.total);
