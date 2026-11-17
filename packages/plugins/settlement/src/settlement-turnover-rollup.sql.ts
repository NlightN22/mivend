// $1 counterparty erp ids, $2 business time zone, $3 the dates an applied document touched (stored and new).
// Only those local days are replaced, so days already removed by retention keep their rolled-up figures.
const TOUCHED_DAYS = `SELECT DISTINCT (x AT TIME ZONE $2)::date AS day FROM unnest($3::timestamptz[]) AS x`;

export const ROLLUP_DELETE_SQL = `
    DELETE FROM settlement_turnover_daily r
    WHERE r."counterpartyErpId" = ANY($1::text[])
        AND r.day IN (${TOUCHED_DAYS})`;

export const ROLLUP_INSERT_SQL = `
    WITH days AS (${TOUCHED_DAYS})
    INSERT INTO settlement_turnover_daily ("counterpartyErpId", day, currency, "turnoverMinor", "saleDocuments")
    SELECT e."counterpartyErpId", dd.day, e.currency,
        SUM(e."amountMinor"),
        COUNT(DISTINCT d.id) FILTER (WHERE t.category = 'sale')
    FROM days dd
    JOIN settlement_document d ON NOT d."isDeleted"
        AND d.date >= (dd.day::timestamp AT TIME ZONE $2)
        AND d.date < ((dd.day + 1)::timestamp AT TIME ZONE $2)
    JOIN settlement_document_entry e ON e."documentId" = d.id
    JOIN settlement_document_type t ON t."documentType" = d."documentType"
        AND NOT t."isDeleted" AND t."movesTurnover"
    WHERE e."counterpartyErpId" = ANY($1::text[])
    GROUP BY 1, 2, 3`;
