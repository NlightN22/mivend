// $1 = retention months. Removable: ERP-owned, every entry before its triple's window start (no
// balance fact = kept), and no linked local order or payment still open. A tombstone waits twice
// the period so a late older version of the document stays a noop.
export const REMOVABLE_DOCUMENT_PREDICATE = `
    d."isErpOwned" = true
    AND EXISTS (SELECT 1 FROM settlement_document_entry e WHERE e."documentId" = d.id)
    AND NOT EXISTS (
        SELECT 1 FROM settlement_document_entry e
        LEFT JOIN settlement_balance b
            ON b."organizationErpId" = e."organizationErpId"
           AND b."counterpartyErpId" = e."counterpartyErpId"
           AND b."contractErpId" = e."contractErpId"
           AND b."isDeleted" = false
           AND b."openingDate" IS NOT NULL
        WHERE e."documentId" = d.id
          AND (b.id IS NULL OR d.date >= b."openingDate" - make_interval(months => $1::int * CASE WHEN d."isDeleted" THEN 2 ELSE 1 END))
    )
    AND NOT EXISTS (
        SELECT 1 FROM settlement_document_entry e
        JOIN settlement_order_link l ON l."entryId" = e.id
        JOIN "order" o ON o.id = l."orderId"
        WHERE e."documentId" = d.id
          AND (o.state NOT IN ('Cancelled', 'Delivered')
               OR EXISTS (
                   SELECT 1 FROM payment_attempt p
                   WHERE p."orderId" = o.id AND p."paymentStatus" IN ('pending', 'authorized')
               ))
    )`;

// Documents (any state) that reference a triple with no balance fact are never removed.
export const NO_BALANCE_FACT_COUNT_SQL = `
    SELECT count(DISTINCT d.id)::int AS count FROM settlement_document d
    JOIN settlement_document_entry e ON e."documentId" = d.id
    WHERE d."isErpOwned" = true AND NOT EXISTS (
        SELECT 1 FROM settlement_balance b
        WHERE b."organizationErpId" = e."organizationErpId"
          AND b."counterpartyErpId" = e."counterpartyErpId"
          AND b."contractErpId" = e."contractErpId"
          AND b."isDeleted" = false AND b."openingDate" IS NOT NULL
    )`;
