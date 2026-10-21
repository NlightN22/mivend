type BranchClause = { sql: string; params: Record<string, string | null> };

// Read-time branch (#263): the trading point's servicing branch, else the counterparty's, else the default.
export function readTimeBranchClause(
    tradingPointIdSql: string,
    counterpartyAlias: string,
    branchId: string | null,
    defaultBranchId: string | null,
): BranchClause {
    return {
        sql: `COALESCE((SELECT tp."servicingBranchId" FROM trading_point tp WHERE tp.id::text = ${tradingPointIdSql}), ${counterpartyAlias}."branchId", :orderDefaultBranchId) = :branchId`,
        params: { branchId, orderDefaultBranchId: defaultBranchId },
    };
}

export function orderBranchClause(
    orderAlias: string,
    counterpartyAlias: string,
    branchId: string | null,
    defaultBranchId: string | null,
): BranchClause {
    return readTimeBranchClause(
        `"${orderAlias}"."customFieldsTradingpointid"`,
        counterpartyAlias,
        branchId,
        defaultBranchId,
    );
}

// A proforma takes its order's point; a contract proforma (no order) falls through to its counterparty.
export function proformaBranchClause(
    proformaAlias: string,
    counterpartyAlias: string,
    branchId: string | null,
    defaultBranchId: string | null,
): BranchClause {
    return readTimeBranchClause(
        `(SELECT o."customFieldsTradingpointid" FROM "order" o WHERE o.id = "${proformaAlias}"."orderId")`,
        counterpartyAlias,
        branchId,
        defaultBranchId,
    );
}
