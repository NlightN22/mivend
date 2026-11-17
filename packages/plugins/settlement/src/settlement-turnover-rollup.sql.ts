// $1 counterparty erp ids, $2 business time zone. Only days that still have documents (tombstones
// included) are replaced, so days already removed by retention keep their rolled-up figures.
export const ROLLUP_DELETE_SQL = `
    DELETE FROM settlement_turnover_daily r
    USING (
        SELECT e."counterpartyErpId" AS cp, MIN((d.date AT TIME ZONE $2)::date) AS floor
        FROM settlement_document_entry e
        JOIN settlement_document d ON d.id = e."documentId"
        WHERE e."counterpartyErpId" = ANY($1::text[])
        GROUP BY e."counterpartyErpId"
    ) f
    WHERE r."counterpartyErpId" = f.cp AND r.day >= f.floor`;

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
