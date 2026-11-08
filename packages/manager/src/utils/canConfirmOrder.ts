import { isNotRegisteredInErp } from '../composables/isNotRegisteredInErp';

export interface ConfirmEligibilityInput {
    state: string;
    lineCount: number;
    customFields: {
        isExternal: boolean | null;
        erpOrderId: string | null;
        erpRegistrationStatus: string | null;
    };
}

// Mirrors the refusals of ReservationService.reserveOrder; a paid order is not cancellable but can still be confirmed.
export function canConfirmOrder(order: ConfirmEligibilityInput): boolean {
    return (
        order.state !== 'Cancelled' &&
        order.lineCount > 0 &&
        order.customFields.isExternal !== true &&
        isNotRegisteredInErp(order.customFields)
    );
}
