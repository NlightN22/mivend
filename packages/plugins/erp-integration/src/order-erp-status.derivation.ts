import type { ErpOrderStatus } from '@mivend/plugin-erp-order';

export interface OrderStatusFacts {
    markedForDeletion?: boolean;
    delivered?: boolean;
    inDelivery?: boolean;
    hasRealization?: boolean;
    hasOrder?: boolean;
    status?: string;
}

const APPROVED_STATUS = 'Согласован';
const UNDER_APPROVAL_STATUS = 'НаСогласовании';

// Absent fact = not computed by the producer, never false; null means nothing to derive.
export function deriveOrderErpStatus(facts: OrderStatusFacts): ErpOrderStatus | null {
    if (facts.markedForDeletion === true) return 'CANCELLED';
    if (facts.delivered === true) return 'DELIVERED';
    if (facts.inDelivery === true) return 'DELIVERING';
    if (facts.hasRealization === true) return 'SHIPPING';
    if (facts.hasOrder === true) return 'PICKING';
    if (facts.status === APPROVED_STATUS) return 'APPROVED';
    if (facts.status === UNDER_APPROVAL_STATUS) return 'UNDER_APPROVAL';
    return null;
}
