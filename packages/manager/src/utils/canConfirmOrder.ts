import { isNotRegisteredInErp } from '../composables/isNotRegisteredInErp';

export interface ConfirmEligibilityInput {
    cancellable: boolean;
    lineCount: number;
    customFields: {
        isExternal: boolean | null;
        erpOrderId: string | null;
        erpRegistrationStatus: string | null;
    };
}

// Mirrors the refusals of ReservationService.reserveOrder; Order.cancellable is false for shipped, cancelled and ERP-owned states.
export function canConfirmOrder(order: ConfirmEligibilityInput): boolean {
    return (
        order.cancellable &&
        order.lineCount > 0 &&
        order.customFields.isExternal !== true &&
        isNotRegisteredInErp(order.customFields)
    );
}
