// One filter per compared aggregate: the local count and the summary request both read it, so the two
// sides count the same set. Intake refusal rules: handlers/order-changed.handler.ts, docs/order-changed-handler.md.
export interface AggregateFilter {
    description: string;
    summaryParams: Readonly<Record<string, string>>;
    // 'count' when the upstream figure to compare is count, not activeCount.
    theirFigure: 'count' | 'active';
}

// Orders: every row that is not deleted or marked for deletion; status, total and realization do not matter.
export const CUSTOMER_ORDER_COUNT_CONDITION = `"customFieldsErporderid" IS NOT NULL AND "customFieldsErpmarkedfordeletion" IS NOT TRUE`;

const DEFAULT_FILTER: AggregateFilter = {
    description: 'active rows',
    summaryParams: {},
    theirFigure: 'active',
};

const FILTERS: Readonly<Record<string, AggregateFilter>> = {
    'customer-order': {
        description:
            'not deleted and not marked for deletion; status, total and realization are ignored',
        summaryParams: { excludeDeleted: 'true' },
        theirFigure: 'count',
    },
    // Upstream stock tied to a deleted warehouse cannot be tracked locally.
    stock: {
        description: 'received stock rows of active warehouses',
        summaryParams: { excludeDeletedWarehouse: 'true' },
        theirFigure: 'active',
    },
    storageLocation: { description: 'all rows', summaryParams: {}, theirFigure: 'count' },
};

export function filterFor(aggregateType: string): AggregateFilter {
    return FILTERS[aggregateType] ?? DEFAULT_FILTER;
}
