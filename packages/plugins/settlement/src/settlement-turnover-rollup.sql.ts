// $1 counterparty erp ids, $2 business time zone, $3 the earliest date the applied document touched (old or
// new). Only days that still have documents (tombstones included) or were touched are replaced, so days already removed by retention keep their rolled-up figures.
export const ROLLUP_DELETE_SQL = `
    WITH f AS (
        SELECT c.id AS cp, COALESCE(m.floor, 'infinity'::date) AS floor
        FROM unnest($1::text[]) AS c(id)
        LEFT JOIN LATERAL (
            SELECT MIN((d.date AT TIME ZONE $2)::date) AS floor
            FROM settlement_document_entry e
            JOIN settlement_document d ON d.id = e."documentId"
            WHERE e."counterpartyErpId" = c.id
        ) m ON true
    )
    DELETE FROM settlement_turnover_daily r
    USING f
    WHERE r."counterpartyErpId" = f.cp
        AND r.day >= LEAST(f.floor, ($3::timestamptz AT TIME ZONE $2)::date)`;

export const ROLLUP_INSERT_SQL = `
    INSERT INTO settlement_turnover_daily ("counterpartyErpId", day, currency, "turnoverMinor", "saleDocuments")
    SELECT e."counterpartyErpId", (d.date AT TIME ZONE $2)::date, e.currency,
        SUM(e."amountMinor"),
        COUNT(DISTINCT d.id) FILTER (WHERE t.category = 'sale')
    FROM settlement_document_entry e
    JOIN settlement_document d ON d.id = e."documentId" AND NOT d."isDeleted"
    JOIN settlement_document_type t ON t."documentType" = d."documentType"
        AND NOT t."isDeleted" AND t."movesTurnover"
    WHERE e."counterpartyErpId" = ANY($1::text[])
    GROUP BY 1, 2, 3`;
