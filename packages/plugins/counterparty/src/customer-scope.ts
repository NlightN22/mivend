import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

// Restricts a customer query to customers of the visible counterparties, as a subquery: no id list is loaded.
export function applyCustomerScope<T extends ObjectLiteral, C extends ObjectLiteral>(
    customers: SelectQueryBuilder<T>,
    visibleCounterparties: SelectQueryBuilder<C>,
): SelectQueryBuilder<T> {
    const alias = visibleCounterparties.alias;
    const sub = visibleCounterparties.clone().orderBy().select(`"${alias}"."id"::text`);
    return customers.andWhere(
        `"${customers.alias}"."customFieldsCounterpartyid"::text IN (${sub.getQuery()})`,
        sub.getParameters(),
    );
}
