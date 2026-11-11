import type { SettlementDocumentFilter } from './settlement-shop.types';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface StatementScope {
    params: unknown[];
    bind: (value: unknown) => string;
    where: string[];
}

// Entry "e", document "d", contract "c": the clauses the visible list and the hidden summary share.
export function statementScope(
    counterpartyId: string,
    filter: SettlementDocumentFilter,
): StatementScope {
    const params: unknown[] = [counterpartyId];
    const bind = (value: unknown): string => {
        params.push(value);
        return `$${params.length}`;
    };
    const where = [
        'e."counterpartyId" = $1',
        'NOT d."isDeleted"',
        'e."contractId" IS NOT NULL',
        'c."isCustomerContract" IS TRUE',
    ];
    if (filter.contractId) where.push(`e."contractId" = ${bind(filter.contractId)}`);
    if (filter.organizationId) {
        where.push(`e."organizationErpId" = ${bind(filter.organizationId)}`);
    }
    if (filter.dateFrom && DATE_ONLY.test(filter.dateFrom)) {
        where.push(`d.date::date >= ${bind(filter.dateFrom)}::date`);
    }
    if (filter.dateTo && DATE_ONLY.test(filter.dateTo)) {
        where.push(`d.date::date <= ${bind(filter.dateTo)}::date`);
    }
    return { params, bind, where };
}
