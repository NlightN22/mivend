// FIFO per (organization, contract) triple of one counterparty, evaluated in SQL: credits (payments,
// returns, a negative opening balance) close the oldest debts first; a positive opening balance is
// the oldest lot and counts as already overdue. $1 = counterparty id, $2 = visible contract kinds (empty = none).
export const AGING_CTE = `
bal AS (
    SELECT b."organizationErpId" AS org, b."contractId" AS ctr, b."openingDate" AS od,
        b."openingBalance" AS ob, b."closingBalance" AS cb, b.currency,
        COALESCE(c."paymentDelayDays", 0) AS delay, c.name AS cname
    FROM settlement_balance b
    JOIN contract c ON c.id::text = b."contractId" AND c."contractKind" = ANY($2::text[])
    WHERE b."counterpartyId" = $1 AND NOT b."isDeleted" AND b."contractId" IS NOT NULL
),
ent AS (
    SELECT e.id, bal.org, bal.ctr, d.date, e."amountMinor" AS amt,
        COALESCE(e."dueDate", d.date + bal.delay * interval '1 day') AS due
    FROM settlement_document_entry e
    JOIN settlement_document d ON d.id = e."documentId" AND NOT d."isDeleted"
    JOIN bal ON bal.org = e."organizationErpId" AND bal.ctr = e."contractId"
    WHERE e."counterpartyId" = $1 AND (bal.od IS NULL OR d.date >= bal.od)
),
credit AS (
    SELECT bal.org, bal.ctr,
        COALESCE(SUM(-ent.amt) FILTER (WHERE ent.amt < 0), 0) + GREATEST(-bal.ob, 0) AS total
    FROM bal LEFT JOIN ent ON ent.org = bal.org AND ent.ctr = bal.ctr
    GROUP BY bal.org, bal.ctr, bal.ob
),
lot AS (
    SELECT ent.id, ent.org, ent.ctr, ent.amt, ent.due, 1 AS ord, ent.date AS dt
    FROM ent WHERE ent.amt > 0
    UNION ALL
    SELECT NULL::int, bal.org, bal.ctr, bal.ob, to_timestamp(0), 0, COALESCE(bal.od, to_timestamp(0))
    FROM bal WHERE bal.ob > 0
),
aged AS (
    SELECT lot.id, lot.org, lot.ctr, lot.due,
        GREATEST(0, LEAST(lot.amt, SUM(lot.amt) OVER (
            PARTITION BY lot.org, lot.ctr ORDER BY lot.ord, lot.dt, lot.id) - credit.total)) AS open
    FROM lot JOIN credit ON credit.org = lot.org AND credit.ctr = lot.ctr
)`;

export const ORDER_REFS_SQL = `COALESCE((
    SELECT json_agg(json_build_object(
        'orderId', CASE WHEN o."customFieldsCounterpartyid" = e."counterpartyId" THEN l."orderId" END,
        'orderErpId', l."orderErpId", 'amount', l."amountMinor",
        'orderCode', CASE WHEN o."customFieldsCounterpartyid" = e."counterpartyId" THEN o.code END
    ) ORDER BY l.id)
    FROM settlement_order_link l LEFT JOIN "order" o ON o.id = l."orderId"
    WHERE l."entryId" = e.id), '[]'::json)`;

export const escapeLike = (term: string): string => term.replace(/[\\%_]/g, '\\$&');
