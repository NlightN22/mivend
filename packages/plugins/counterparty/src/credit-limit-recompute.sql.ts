// A limit string that is not a plain non-negative number is treated as "no limit".
const LIMIT_NUMERIC = `CASE WHEN c."creditLimit" ~ '^[0-9]+(\\.[0-9]+)?$' THEN c."creditLimit"::numeric END`;

// pool = active non-flagged limits; flagged = active controlledIndividually limits.
const SUMS_CTE = `sums AS (
    SELECT c."counterpartyId" AS cp,
           SUM(CASE WHEN c."controlledIndividually" IS NOT TRUE THEN ${LIMIT_NUMERIC} END) AS pool,
           SUM(CASE WHEN c."controlledIndividually" IS TRUE THEN ${LIMIT_NUMERIC} END) AS flagged
    FROM contract c
    WHERE c."isActive"
    GROUP BY c."counterpartyId"
)`;

export const recomputeContractLimitsSql = `
WITH ${SUMS_CTE},
target AS (
    SELECT c.id,
           CASE
               WHEN NOT c."isActive" THEN NULL
               WHEN c."controlledIndividually" IS TRUE AND COALESCE(s.flagged, 0) > COALESCE(s.pool, 0)
                   THEN ROUND(${LIMIT_NUMERIC} * COALESCE(s.pool, 0) / s.flagged, 2)
               ELSE ${LIMIT_NUMERIC}
           END AS eff
    FROM contract c
    LEFT JOIN sums s ON s.cp = c."counterpartyId"
),
changed AS (
    SELECT t.id, t.eff
    FROM target t
    INNER JOIN contract c ON c.id = t.id
    WHERE c."effectiveCreditLimit" IS DISTINCT FROM t.eff
    LIMIT $1
),
upd AS (
    UPDATE contract SET "effectiveCreditLimit" = changed.eff, "updatedAt" = now()
    FROM changed WHERE contract.id = changed.id
    RETURNING 1
)
SELECT COUNT(*)::int AS n FROM upd`;

export const recomputeCounterpartyLimitsSql = `
WITH ${SUMS_CTE},
target AS (
    SELECT cp.id, COALESCE(ROUND(s.pool), 0)::bigint AS pool
    FROM counterparty cp
    LEFT JOIN sums s ON s.cp = cp.id::text
),
changed AS (
    SELECT t.id, t.pool
    FROM target t
    INNER JOIN counterparty cp ON cp.id = t.id
    WHERE cp."creditLimit" IS DISTINCT FROM t.pool
    LIMIT $1
),
upd AS (
    UPDATE counterparty SET "creditLimit" = changed.pool, "updatedAt" = now()
    FROM changed WHERE counterparty.id = changed.id
    RETURNING 1
)
SELECT COUNT(*)::int AS n FROM upd`;
