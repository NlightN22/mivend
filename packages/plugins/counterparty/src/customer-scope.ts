import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

// Restricts a customer query to customers of the visible counterparties, as a subquery: no id list is loaded.
export function applyCustomerScope<T extends ObjectLiteral, C extends ObjectLiteral>(
    customers: SelectQueryBuilder<T>,
    visibleCounterparties: SelectQueryBuilder<C>,
): SelectQueryBuilder<T> {
    const alias = visibleCounterparties.alias;
    const sub = visibleCounterparties.clone().orderBy().select(`"${alias}"."id"::text`);
    const taken = customers.getParameters();
    const params = sub.getParameters();
    const clash = Object.keys(params).filter(name => name in taken);
    if (clash.length > 0)
        throw new Error(
            `Customer scope parameter names clash with the list query: ${clash.join(', ')}`,
        );
    return customers.andWhere(
        `"${customers.alias}"."customFieldsCounterpartyid"::text IN (${sub.getQuery()})`,
        params,
    );
}
