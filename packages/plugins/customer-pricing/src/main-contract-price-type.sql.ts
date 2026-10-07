export function mainContractPriceTypeIdSql(customerIdExpr: string): string {
    return `(SELECT mpt.id
        FROM customer mcu
        JOIN counterparty mcp ON mcp.id::text = mcu."customFieldsCounterpartyid"::text
        JOIN contract mco ON mco."erpId" = mcp."mainContractId" AND mco."isActive" = true
        JOIN price_type mpt ON mpt."externalId" = mco."priceTypeId" AND mpt."isActive" = true
        WHERE mcu.id::text = (${customerIdExpr})::text
        LIMIT 1)`;
}
