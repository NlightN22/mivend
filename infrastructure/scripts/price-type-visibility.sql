-- #235 data step, run with psql -v customer_codes=code-a,code-b: marks those price types as
-- customer-visible and fills every branch allow-list that is still empty with all customer types.
UPDATE price_type
   SET visibility = 'customer'
 WHERE code = ANY (string_to_array(:'customer_codes', ','))
   AND "isPurchase" = false;

UPDATE branch_settings
   SET "visiblePriceTypeIds" = (
        SELECT COALESCE(json_agg(id::text ORDER BY id), '[]'::json)::text
          FROM price_type
         WHERE visibility = 'customer')
 WHERE "visiblePriceTypeIds" IS NULL;
