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

export interface LineDiscountLimit {
    max: number | null;
    percent: number | null;
}

// The signed-in employee's ceiling and the server's discount percent (from the base price) per order line.
export async function fetchLineDiscountLimits(
    orderId: string,
): Promise<Map<string, LineDiscountLimit>> {
    const rows = (await adminApi(OrderLineDiscountLimitsDocument, { orderId }))
        .orderLineDiscountLimits;
    return new Map(
        rows.map(r => [r.orderLineId, { max: r.maxDiscountPercent, percent: r.discountPercent }]),
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
