-- One-off report (#225): active counterparties sharing a normalized inn where at least one has a live portal Customer.
-- Read-only. Usage: docker exec -i docker-postgres-central-1 psql -U postgres -d <db> < this file
SELECT regexp_replace(c.inn, '\D', '', 'g') AS inn,
       c.id, c."erpId", c."shortName",
       EXISTS (SELECT 1 FROM customer cu
               WHERE cu."customFieldsCounterpartyid"::text = c.id::text AND cu."deletedAt" IS NULL) AS portal_linked
FROM counterparty c
WHERE c."isActive" = true AND regexp_replace(c.inn, '\D', '', 'g') <> ''
  AND regexp_replace(c.inn, '\D', '', 'g') IN (
      SELECT regexp_replace(d.inn, '\D', '', 'g') FROM counterparty d
      WHERE d."isActive" = true AND regexp_replace(d.inn, '\D', '', 'g') <> ''
      GROUP BY 1 HAVING count(*) > 1)
ORDER BY 1, c.id;
