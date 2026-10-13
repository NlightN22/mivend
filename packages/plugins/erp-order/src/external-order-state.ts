import type { OrderState } from '@vendure/core';

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
