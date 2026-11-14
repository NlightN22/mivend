import { tr } from '../utils/lazyLabels';
import { computed, onMounted, reactive, ref, watch, type Ref } from 'vue';
import {
    confirmOrder,
    extendOrderReservation,
    fetchReservationExtensionLimit,
    releaseOrderReservation,
    type OrderReservation,
} from '../api/reservation';
import { useAuthStore } from '../stores/auth';

export function useReservationActions(options: {
    orderId: () => string;
    reservations: Ref<OrderReservation[]>;
    defaultDays: () => number;
    onChanged: () => void;
}) {
    const authStore = useAuthStore();
    const form = reactive({ days: String(options.defaultDays()), extendDays: '1' });
    const submitting = ref(false);
    const error = ref('');
    const extensionMaxDays = ref<number | null>(null);

    watch(options.defaultDays, days => {
        form.days = String(days);
    });

    const active = computed(() => options.reservations.value.filter(r => r.status === 'active'));
    const reserved = computed(() => active.value.length > 0);
    // All lines share one expiresAt (see ReservationService.confirmOrder), so any active row works.
    const expiresAt = computed(() => active.value[0]?.expiresAt ?? null);
    // A role with no configured limit gets no extend action (absence is strict, see fetchReservationExtensionLimit).
    const canExtend = computed(() => extensionMaxDays.value !== null);
    const canConfirm = computed(() => authStore.hasPermission('ConfirmOrder'));

    onMounted(async () => {
        const roleCode = authStore.roleCode;
        if (!roleCode) return;
        const limit = await fetchReservationExtensionLimit(roleCode);
        extensionMaxDays.value = limit?.maxExtraDays ?? null;
    });

    async function run(action: () => Promise<unknown>, failure: string): Promise<boolean> {
        submitting.value = true;
        error.value = '';
        try {
            await action();
            options.onChanged();
            return true;
        } catch (e) {
            error.value = e instanceof Error ? e.message : failure;
            return false;
        } finally {
            submitting.value = false;
        }
    }

    function positiveDays(value: string, message: string): number | null {
        const days = Number(value);
        if (Number.isInteger(days) && days > 0) return days;
        error.value = message;
        return null;
    }

    async function confirm(): Promise<boolean> {
        const days = positiveDays(form.days, tr('orderDetail.reservation.daysInvalid'));
        if (days === null) return false;
        return run(
            () => confirmOrder(options.orderId(), days),
            tr('orderDetail.reservation.confirmFailed'),
        );
    }

    async function extend(): Promise<boolean> {
        const days = positiveDays(form.extendDays, tr('orderDetail.reservation.extendInvalid'));
        if (days === null) return false;
        return run(
            () => extendOrderReservation(options.orderId(), days),
            tr('orderDetail.reservation.extendFailed'),
        );
    }

    const release = (): Promise<boolean> =>
        run(
            () => releaseOrderReservation(options.orderId()),
            tr('orderDetail.reservation.releaseFailed'),
        );

    return {
        form,
        submitting,
        error,
        extensionMaxDays,
        reserved,
        expiresAt,
        canExtend,
        canConfirm,
        confirm,
        extend,
        release,
    };
}
