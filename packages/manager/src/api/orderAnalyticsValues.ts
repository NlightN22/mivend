import { adminApi } from './client';
import { OrderAnalyticsFilterValuesDocument } from './generated/graphql';
import type { OrderAnalyticsValueKind } from './generated/graphql';

export interface OrderFilterValueOption {
    value: string;
    orderCount: number;
}

// The values the orders really have; a failed or unavailable answer offers none.
export function fetchOrderFilterValues(
    kind: OrderAnalyticsValueKind,
): Promise<OrderFilterValueOption[]> {
    return adminApi(OrderAnalyticsFilterValuesDocument, { kind })
        .then(r =>
            r.orderAnalyticsFilterValues.state === 'OK' ? r.orderAnalyticsFilterValues.values : [],
        )
        .catch(() => []);
}
