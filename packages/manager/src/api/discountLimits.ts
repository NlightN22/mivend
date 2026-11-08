import { adminApi } from './client';
import {
    DiscountLimitScopeOptionsDocument,
    DiscountLimitsDocument,
    OrderLineDiscountLimitsDocument,
    RemoveDiscountLimitDocument,
    SetDiscountLimitDocument,
    type DiscountLimitScopeOptionsQuery,
    type DiscountLimitsQuery,
} from './generated/graphql';

export type ScopeOption = DiscountLimitScopeOptionsQuery['discountLimitScopeOptions'][number];
export type DiscountLimitRow = DiscountLimitsQuery['discountLimits'][number];

export async function fetchDiscountLimits(administratorId: string): Promise<DiscountLimitRow[]> {
    return (await adminApi(DiscountLimitsDocument, { administratorId })).discountLimits;
}

export async function setDiscountLimit(
    administratorId: string,
    scopeKind: string,
    scopeRef: string,
    maxDiscountPercent: number,
): Promise<void> {
    await adminApi(SetDiscountLimitDocument, {
        administratorId,
        scopeKind,
        scopeRef,
        maxDiscountPercent,
    });
}

export async function removeDiscountLimit(
    administratorId: string,
    scopeKind: string,
    scopeRef: string,
): Promise<void> {
    await adminApi(RemoveDiscountLimitDocument, { administratorId, scopeKind, scopeRef });
}

// The signed-in employee's ceiling per order line; a line without a limit is absent from the map.
export async function fetchLineDiscountCeilings(orderId: string): Promise<Map<string, number>> {
    const rows = (await adminApi(OrderLineDiscountLimitsDocument, { orderId }))
        .orderLineDiscountLimits;
    return new Map(
        rows.flatMap(r =>
            r.maxDiscountPercent === null ? [] : [[r.orderLineId, r.maxDiscountPercent]],
        ),
    );
}

export async function fetchScopeOptions(
    scopeKind: string,
    search: string | null,
    refs: string[] | null = null,
): Promise<ScopeOption[]> {
    return (await adminApi(DiscountLimitScopeOptionsDocument, { scopeKind, search, refs }))
        .discountLimitScopeOptions;
}
