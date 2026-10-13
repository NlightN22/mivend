import type { SettlementVisibility } from './settlement-visibility';

export interface SqlClause {
    sql: string;
    params: unknown[];
}

// Scope: only the caller's own counterparty, live documents, client contracts when configured.
export function scopeClause(
    counterpartyId: string,
    visibility: SettlementVisibility,
    withTypes: boolean,
    start = 1,
): SqlClause {
    const params: unknown[] = [counterpartyId];
    const parts = [`e."counterpartyId" = $${start}`, 'NOT d."isDeleted"'];
    if (visibility.contractKinds.length > 0) {
        params.push(visibility.contractKinds);
        parts.push(`c."contractKind" = ANY($${start + params.length - 1})`);
    }
    if (withTypes && visibility.typeCategories.size > 0) {
        params.push([...visibility.typeCategories.keys()]);
        parts.push(`d."documentType" = ANY($${start + params.length - 1})`);
    }
    return { sql: parts.join(' AND '), params };
}

export const ENTRY_JOINS = `
    FROM settlement_document_entry e
    JOIN settlement_document d ON d.id = e."documentId"
    LEFT JOIN contract c ON c.id::text = e."contractId"
    LEFT JOIN organization_requisites org ON org."erpId" = e."organizationErpId"`;

export const ORDER_REFS_SQL = `COALESCE((
    SELECT json_agg(json_build_object(
        'orderId', l."orderId", 'orderErpId', l."orderErpId", 'amount', l."amountMinor",
        'orderCode', CASE WHEN o."customFieldsCounterpartyid" = e."counterpartyId" THEN o.code END
    ) ORDER BY l.id)
    FROM settlement_order_link l LEFT JOIN "order" o ON o.id = l."orderId"
    WHERE l."entryId" = e.id), '[]'::json)`;
