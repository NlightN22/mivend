// Compare the point id as an integer: a text cast on the key defeats the primary-key index and the
// per-order subquery scans every trading point.
const POINT_ID_PATTERN = "'^[1-9][0-9]{0,8}$'";

type BranchClause = { sql: string; params: Record<string, string | null> };

// Read-time branch (#263): the trading point's servicing branch, else the counterparty's; none means hidden (#286).
export function readTimeBranchClause(
    tradingPointIdSql: string,
    counterpartyAlias: string,
    branchId: string | null,
): BranchClause {
    return {
        sql: `COALESCE((SELECT tp."servicingBranchId" FROM trading_point tp WHERE tp.id = CASE WHEN ${tradingPointIdSql} ~ ${POINT_ID_PATTERN} THEN ${tradingPointIdSql}::int END), ${counterpartyAlias}."branchId") = :branchId`,
        params: { branchId },
    };
}

export function orderBranchClause(
    orderAlias: string,
    counterpartyAlias: string,
    branchId: string | null,
): BranchClause {
    return readTimeBranchClause(
        `"${orderAlias}"."customFieldsTradingpointid"`,
        counterpartyAlias,
        branchId,
    );
}

// A proforma takes its order's point; a contract proforma (no order) falls through to its counterparty.
// The caller left-joins the order's trading point as tradingPointAlias (a join, not per-row subqueries).
export function proformaBranchClause(
    tradingPointAlias: string,
    counterpartyAlias: string,
    branchId: string | null,
): BranchClause {
    return {
        sql: `COALESCE("${tradingPointAlias}"."servicingBranchId", ${counterpartyAlias}."branchId") = :branchId`,
        params: { branchId },
    };
}
