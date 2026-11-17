// $1 counterparty erp ids; the rollup is keyed by erp id and holds days that retention already removed.
const range = (col: string, from: number): string =>
    `${col} BETWEEN $${from}::date AND $${from + 1}::date`;

export const SALES_SQL = `
SELECT r.currency,
    COALESCE(SUM(r."turnoverMinor") FILTER (WHERE ${range('r.day', 2)}), 0) AS "last30",
    COALESCE(SUM(r."turnoverMinor") FILTER (WHERE ${range('r.day', 4)}), 0) AS "prev30",
    COALESCE(SUM(r."turnoverMinor") FILTER (WHERE ${range('r.day', 6)}), 0) AS "mtd",
    COALESCE(SUM(r."turnoverMinor") FILTER (WHERE ${range('r.day', 8)}), 0) AS "prevMonth",
    COALESCE(SUM(r."turnoverMinor") FILTER (WHERE ${range('r.day', 10)}), 0) AS "prevYearMonth",
    COALESCE(SUM(r."turnoverMinor") FILTER (WHERE ${range('r.day', 12)}), 0) AS "ytd",
    COALESCE(SUM(r."turnoverMinor") FILTER (WHERE ${range('r.day', 14)}), 0) AS "prevYtd",
    COALESCE(SUM(r."turnoverMinor") FILTER (WHERE ${range('r.day', 16)}), 0) AS "last12",
    COALESCE(SUM(r."saleDocuments") FILTER (WHERE ${range('r.day', 16)}), 0) AS "saleDocuments12m"
FROM settlement_turnover_daily r
WHERE r."counterpartyErpId" = ANY($1::text[]) AND r.day >= $18::date
GROUP BY r.currency`;

// $1 erp ids, $2 12-month start, $3 today, $4 currency codes of the card currency.
export const LAST_SALE_SQL = `
SELECT r."counterpartyErpId" AS "erpId",
    (MAX(r.day) FILTER (WHERE r."saleDocuments" > 0))::text AS "lastSale",
    COALESCE(SUM(r."turnoverMinor") FILTER (WHERE r.currency = ANY($4::text[])), 0) AS "turnover12m"
FROM settlement_turnover_daily r
WHERE r."counterpartyErpId" = ANY($1::text[]) AND r.day BETWEEN $2::date AND $3::date
GROUP BY r."counterpartyErpId"
HAVING MAX(r.day) FILTER (WHERE r."saleDocuments" > 0) IS NOT NULL`;

const reference = (k: number, e: string): string => `
    bool_or(r."saleDocuments" > 0 AND r.day BETWEEN ${e} - 29 AND ${e}) AS "act${k}",
    bool_or(r."saleDocuments" > 0 AND r.day BETWEEN ${e} - 119 AND ${e} - 30) AS "prior${k}",
    bool_or(r."saleDocuments" > 0 AND r.day < ${e} - 29) AS "before${k}",
    MAX(r.day) FILTER (WHERE r."saleDocuments" > 0 AND r.day <= ${e}) AS "last${k}",
    bool_or(r."saleDocuments" > 0 AND r.day > (${e} - interval '12 months')::date AND r.day <= ${e}) AS "s12${k}"`;

const counts = (k: number, e: string): string => `
    COUNT(*) FILTER (WHERE "act${k}") AS "active${k}",
    COUNT(*) FILTER (WHERE "act${k}" AND NOT "before${k}") AS "new${k}",
    COUNT(*) FILTER (WHERE "act${k}" AND "before${k}" AND NOT "prior${k}") AS "returned${k}",
    COUNT(*) FILTER (WHERE "last${k}" <= ${e} - 90 AND "s12${k}") AS "lost${k}"`;

// $1 erp ids, $2 today, $3 today - 30, $4 one year back, $5 lower bound of the scan.
export const DYNAMICS_SQL = `
WITH per AS (
    SELECT r."counterpartyErpId" AS cp, MIN(r.day) AS first_day,
        ${[reference(0, '$2::date'), reference(1, '$3::date'), reference(2, '$4::date')].join(',')}
    FROM settlement_turnover_daily r
    WHERE r."counterpartyErpId" = ANY($1::text[]) AND r.day >= $5::date
    GROUP BY r."counterpartyErpId"
)
SELECT MIN(first_day)::text AS "historyStartsAt",
    ${[counts(0, '$2::date'), counts(1, '$3::date'), counts(2, '$4::date')].join(',')}
FROM per`;
