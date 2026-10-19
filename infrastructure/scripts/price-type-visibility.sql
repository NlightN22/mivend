-- #235 data step, run with psql -v customer_codes=code-a,code-b: marks those price types as
-- customer-visible and fills every branch allow-list that is still empty with all customer types.
-- Fails before changing anything when an administrator's branch has no branch_settings row (it would see no price types).
DO $$
DECLARE missing text;
BEGIN
    SELECT string_agg(DISTINCT a."customFieldsBranchid", ', ') INTO missing
      FROM administrator a
     WHERE a."customFieldsBranchid" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM branch_settings b WHERE b."branchId" = a."customFieldsBranchid");
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'branches with administrators but no branch_settings row: %', missing;
    END IF;
END $$;

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
