import { adminApi } from './client';
import {
    OrderCheckResultsDocument,
    RecomputeOrderChecksDocument,
    type OrderCheckResultFieldsFragment,
} from './generated/graphql';
import type { OrderCheckFacts, OrderCheckFinding } from '../utils/orderCheckMessages';

function toFinding(row: OrderCheckResultFieldsFragment): OrderCheckFinding {
    return { ...row, facts: (row.facts ?? {}) as OrderCheckFacts };
}

export async function fetchOrderChecks(orderId: string): Promise<OrderCheckFinding[]> {
    const result = await adminApi(OrderCheckResultsDocument, { orderId });
    return result.checkResults.map(toFinding);
}

export async function recomputeOrderChecks(orderId: string): Promise<OrderCheckFinding[]> {
    const result = await adminApi(RecomputeOrderChecksDocument, { orderId });
    return result.recomputeOrderChecks.map(toFinding);
}
