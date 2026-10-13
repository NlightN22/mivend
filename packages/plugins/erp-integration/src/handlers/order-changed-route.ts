export type OrderChangedRoute = 'apply-to-mivend-order' | 'create-external' | 'update-external';

export interface LocalOrderRef {
    isExternal: boolean;
}

// External is decided once by the first event without an orderUuid and no local match (#215);
// later events follow the stored flag, never the payload.
export function decideOrderChangedRoute(
    orderUuid: string | null,
    localByErpOrderId: LocalOrderRef | null,
): OrderChangedRoute {
    if (localByErpOrderId?.isExternal) return 'update-external';
    if (orderUuid || localByErpOrderId) return 'apply-to-mivend-order';
    return 'create-external';
}
