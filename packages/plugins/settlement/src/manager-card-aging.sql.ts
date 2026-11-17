// The aging of settlement-shop.sql.ts over a set of counterparties ($1 = counterparty ids as text):
// every grouping also carries the counterparty so FIFO never crosses customers.
export const AGING_SET_CTE = `
bal AS (
    SELECT b."counterpartyId" AS cp, b."organizationErpId" AS org, b."contractId" AS ctr,
        b."openingDate" AS od, b."openingBalance" AS ob, b."closingBalance" AS cb, b.currency,
        CASE WHEN c."controlledIndividually" IS TRUE AND c."debtDaysLimit" > 0
            THEN c."debtDaysLimit" ELSE NULLIF(cp."paymentDelayDays", 0) END AS delay,
        (c."isCustomerContract" IS TRUE) AS cust
    FROM settlement_balance b
    LEFT JOIN contract c ON c.id::text = b."contractId"
    LEFT JOIN counterparty cp ON cp.id::text = b."counterpartyId"
    WHERE b."counterpartyId" = ANY($1::text[]) AND NOT b."isDeleted"
),
ent AS (
    SELECT e.id, bal.cp, bal.org, bal.ctr, d.date, e."amountMinor" AS amt,
        COALESCE(e."dueDate", d.date + bal.delay * interval '1 day') AS due
    FROM settlement_document_entry e
    JOIN settlement_document d ON d.id = e."documentId" AND NOT d."isDeleted"
    JOIN bal ON bal.cp = e."counterpartyId" AND bal.org = e."organizationErpId"
        AND bal.ctr = e."contractId"
    WHERE e."counterpartyId" = ANY($1::text[]) AND bal.cust AND (bal.od IS NULL OR d.date >= bal.od)
),
credit AS (
    SELECT bal.cp, bal.org, bal.ctr,
        COALESCE(SUM(-ent.amt) FILTER (WHERE ent.amt < 0), 0) + GREATEST(-bal.ob, 0) AS total
    FROM bal LEFT JOIN ent ON ent.cp = bal.cp AND ent.org = bal.org AND ent.ctr = bal.ctr
    GROUP BY bal.cp, bal.org, bal.ctr, bal.ob
),
lot AS (
    SELECT ent.id, ent.cp, ent.org, ent.ctr, ent.amt, ent.due, 1 AS ord, ent.date AS dt
    FROM ent WHERE ent.amt > 0
    UNION ALL
    SELECT NULL::int, bal.cp, bal.org, bal.ctr, bal.ob, to_timestamp(0), 0,
        COALESCE(bal.od, to_timestamp(0))
    FROM bal WHERE bal.ob > 0 AND bal.cust
),
aged AS (
    SELECT lot.id, lot.cp, lot.org, lot.ctr, lot.due,
        GREATEST(0, LEAST(lot.amt, SUM(lot.amt) OVER (
            PARTITION BY lot.cp, lot.org, lot.ctr ORDER BY lot.ord, lot.dt, lot.id) - credit.total)) AS open
    FROM lot JOIN credit ON credit.cp = lot.cp AND credit.org = lot.org AND credit.ctr = lot.ctr
)`;

// One row per customer and currency; overdue is capped per contract like capOverdue.
export const DEBT_BY_CUSTOMER_SQL = `
WITH ${AGING_SET_CTE},
card AS (
    SELECT bal.cp, bal.currency, bal.cb,
        COALESCE((SELECT SUM(a.open) FROM aged a WHERE a.cp = bal.cp AND a.org = bal.org
            AND a.ctr = bal.ctr AND a.due < now()), 0) AS overdue
    FROM bal
)
SELECT card.cp AS "counterpartyId", card.currency,
    SUM(card.cb) AS balance, SUM(LEAST(card.overdue, GREATEST(card.cb, 0))) AS overdue
FROM card GROUP BY card.cp, card.currency`;

export const AGING_BUCKETS_SQL = `
WITH ${AGING_SET_CTE}
SELECT bal.currency,
    COALESCE(SUM(a.open) FILTER (WHERE a.due >= now()), 0) AS "notDue",
    COALESCE(SUM(a.open) FILTER (WHERE a.due < now() AND a.due >= now() - interval '30 days'), 0) AS "d1to30",
    COALESCE(SUM(a.open) FILTER (WHERE a.due < now() - interval '30 days'
        AND a.due >= now() - interval '60 days'), 0) AS "d31to60",
    COALESCE(SUM(a.open) FILTER (WHERE a.due < now() - interval '60 days'), 0) AS "over60"
FROM aged a
JOIN (SELECT DISTINCT cp, org, ctr, currency FROM bal) bal
    ON bal.cp = a.cp AND bal.org = a.org AND bal.ctr = a.ctr
WHERE a.open > 0
GROUP BY bal.currency`;
