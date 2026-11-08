import { computed, ref, type Ref } from 'vue';
import { useIsMobileViewport } from '@mivend/ui-kit';
import { canConfirmOrder } from '../utils/canConfirmOrder';
import { headerActions } from '../utils/orderHeaderActions';
import type { OrderDetail } from '../api/orderDetail';
import { useCancelOrderAsStaff } from './useCancelOrderAsStaff';
import type { useReservationActions } from './useReservationActions';

// The header's confirm and cancel flows live here so a flagged table cell can open them too.
export function useOrderHeaderCommands(deps: {
    order: Ref<OrderDetail | null>;
    reservation: ReturnType<typeof useReservationActions>;
    canSeeChecks: () => boolean;
    canCut: () => boolean;
    onCancelled: () => void;
}) {
    const mobile = useIsMobileViewport(800);
    const confirmOpen = ref(false);
    const extendOpen = ref(false);
    const cancelOpen = ref(false);
    const cancelFlow = useCancelOrderAsStaff(
        () => deps.order.value?.id ?? '',
        () => deps.onCancelled(),
    );
    const confirmable = computed(() => {
        const order = deps.order.value;
        return (
            !!order &&
            canConfirmOrder({
                cancellable: order.cancellable,
                lineCount: order.lines.length,
                customFields: order.customFields,
            })
        );
    });
    const cancelVisible = computed(
        () => cancelFlow.allowed.value && !!deps.order.value?.cancellable,
    );
    const canConfirm = computed(
        () =>
            deps.reservation.canConfirm.value &&
            confirmable.value &&
            !deps.reservation.reserved.value,
    );
    const actions = computed(() =>
        headerActions(
            {
                canConfirm: deps.reservation.canConfirm.value,
                confirmable: confirmable.value,
                reserved: deps.reservation.reserved.value,
                canExtend: deps.reservation.canExtend.value,
                canSeeChecks: deps.canSeeChecks(),
                cancelVisible: cancelVisible.value,
                canCut: deps.canCut(),
            },
            mobile.value,
        ),
    );

    return {
        mobile,
        confirmOpen,
        extendOpen,
        cancelOpen,
        cancelFlow,
        actions,
        canConfirm,
        canCancel: cancelVisible,
    };
}

export type OrderHeaderCommands = ReturnType<typeof useOrderHeaderCommands>;
