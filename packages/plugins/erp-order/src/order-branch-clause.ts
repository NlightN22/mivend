// Read-time branch of an order (#263): its point's servicing branch, else the counterparty's, else the default.
export function orderBranchClause(
    orderAlias: string,
    counterpartyAlias: string,
    branchId: string | null,
    defaultBranchId: string | null,
): { sql: string; params: Record<string, string | null> } {
    return {
        sql: `COALESCE((SELECT tp."servicingBranchId" FROM trading_point tp WHERE tp.id::text = "${orderAlias}"."customFieldsTradingpointid"), ${counterpartyAlias}."branchId", :orderDefaultBranchId) = :branchId`,
        params: { branchId, orderDefaultBranchId: defaultBranchId },
    };
}
