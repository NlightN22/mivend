import type { OrderState } from '@vendure/core';

import { canAdvanceErpStatus } from './erp-status-rank';
import type { ErpOrderStatus } from './types';

export const DEFAULT_EXTERNAL_ERP_STATUS: ErpOrderStatus = 'CONFIRMED';

// External orders are created directly in the state matching the ERP status, never transitioned.
export function externalOrderState(erpStatus: ErpOrderStatus): OrderState {
    switch (erpStatus) {
        case 'CANCELLED':
            return 'Cancelled';
        case 'DELIVERED':
            return 'Delivered';
        case 'SHIPPING':
        case 'DELIVERING':
            return 'Shipped';
        default:
            return 'PaymentAuthorized';
    }
}

// Same forward-only rule as mivend orders; CANCELLED is terminal. Null means "leave as is".
export function nextExternalErpStatus(
    current: string | null | undefined,
    derived: ErpOrderStatus | null,
    referenceRanks: ReadonlyMap<string, number>,
): ErpOrderStatus | null {
    if (derived === null || current === 'CANCELLED') return null;
    if (derived === 'CANCELLED') return derived;
    return canAdvanceErpStatus(current, derived, referenceRanks) ? derived : null;
}
