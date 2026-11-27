// Only a deletion-marked ERP order whose order date left the window, with nothing of ours still open on it.
// The newest processed inbox version of the entity stays, so a late older version is dropped, not re-created.
export const REMOVABLE_EXTERNAL_ORDER_PREDICATE = `
    o."customFieldsIsexternal" = true
    AND o."customFieldsErpmarkedfordeletion" = true
    AND o."customFieldsErporderid" IS NOT NULL
    AND o."orderPlacedAt" IS NOT NULL
    AND o."orderPlacedAt" < now() - make_interval(months => $1::int)
    AND NOT EXISTS (SELECT 1 FROM payment_attempt p
                    WHERE p."orderId" = o.id AND p."paymentStatus" IN ('pending', 'authorized'))
    AND NOT EXISTS (SELECT 1 FROM proforma_invoice f
                    WHERE f."orderId" = o.id AND f.status IN ('pending', 'issued'))
    AND NOT EXISTS (SELECT 1 FROM payment y WHERE y."orderId" = o.id)`;

export const REMOVE_EXTERNAL_ORDER_SQL = `
    WITH gone AS (
        DELETE FROM "order" o WHERE o.id = $2 AND ${REMOVABLE_EXTERNAL_ORDER_PREDICATE} RETURNING o.id
    ), history AS (
        DELETE FROM order_status_history_entry WHERE "orderId" IN (SELECT id FROM gone)
    ), links AS (
        UPDATE settlement_order_link SET "orderId" = NULL WHERE "orderId" IN (SELECT id FROM gone)
    )
    SELECT id FROM gone`;
