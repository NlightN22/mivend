import type { WhereExpressionBuilder } from 'typeorm';

export interface ErpStatusFilter {
    in?: string[];
    notIn?: string[];
}

// `notIn` keeps orders without a status; qb must alias the order table as "order".
export function andErpStatusFilter(qb: WhereExpressionBuilder, filter: ErpStatusFilter): void {
    if (filter.in) {
        qb.andWhere('"order"."customFieldsErpstatus" IN (:...erpStatuses)', {
            erpStatuses: filter.in,
        });
    }
    if (filter.notIn && filter.notIn.length > 0) {
        qb.andWhere(
            '("order"."customFieldsErpstatus" IS NULL OR "order"."customFieldsErpstatus" NOT IN (:...excludedStatuses))',
            { excludedStatuses: filter.notIn },
        );
    }
}
