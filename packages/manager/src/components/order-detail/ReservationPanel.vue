<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { MvButton, MvInput, MvStatusBadge, MvNotice } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    confirmOrder,
    releaseOrderReservation,
    extendOrderReservation,
    fetchReservationExtensionLimit,
    type OrderReservation,
} from '../../api/reservation';

const props = defineProps<{
    orderId: string;
    reservations: OrderReservation[];
    defaultReservationDays: number;
}>();
const emit = defineEmits<{ changed: [] }>();

const authStore = useAuthStore();
const form = reactive({ days: String(props.defaultReservationDays), extendDays: '1' });
const submitting = ref(false);
const error = ref('');
const extensionMaxDays = ref<number | null>(null);

const activeReservations = computed(() => props.reservations.filter(r => r.status === 'active'));
const isConfirmed = computed(() => activeReservations.value.length > 0);
// All lines share one expiresAt (see ReservationService.confirmOrder) — any active row's value works.
const expiresAt = computed(() => activeReservations.value[0]?.expiresAt ?? null);
// Hide the extend action entirely for a role with no configured limit — see
// fetchReservationExtensionLimit's "absence-is-strict" convention.
const canExtend = computed(() => extensionMaxDays.value !== null);

onMounted(async () => {
    const roleCode = authStore.roleCode;
    if (!roleCode) return;
    const limit = await fetchReservationExtensionLimit(roleCode);
    extensionMaxDays.value = limit?.maxExtraDays ?? null;
});

async function handleConfirm(): Promise<void> {
    error.value = '';
    const days = Number(form.days);
    if (!Number.isInteger(days) || days <= 0) {
        error.value = 'Reservation period must be a positive number of days';
        return;
    }
    submitting.value = true;
    try {
        await confirmOrder(props.orderId, days);
        emit('changed');
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not confirm the order';
    } finally {
        submitting.value = false;
    }
}

async function handleRelease(): Promise<void> {
    submitting.value = true;
    try {
        await releaseOrderReservation(props.orderId);
        emit('changed');
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not release the reservation';
    } finally {
        submitting.value = false;
    }
}

async function handleExtend(): Promise<void> {
    error.value = '';
    const days = Number(form.extendDays);
    if (!Number.isInteger(days) || days <= 0) {
        error.value = 'Extension must be a positive number of days';
        return;
    }
    submitting.value = true;
    try {
        await extendOrderReservation(props.orderId, days);
        emit('changed');
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not extend the reservation';
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div class="reservation-panel">
        <div v-if="isConfirmed" class="reservation-panel__status">
            <MvStatusBadge variant="success">Reserved</MvStatusBadge>
            <span class="reservation-panel__expiry">
                Until {{ expiresAt ? new Date(expiresAt).toLocaleString('en-US') : '—' }}
            </span>
        </div>
        <MvNotice v-else variant="info">
            Not confirmed yet — stock is not reserved for this order.
        </MvNotice>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <div v-if="!isConfirmed" class="reservation-panel__form">
            <label class="reservation-panel__label">
                Reservation period (days)
                <MvInput size="sm" type="number" :model-value="form.days" @update:model-value="form.days = $event" />
            </label>
            <MvButton :loading="submitting" @click="handleConfirm">Confirm order</MvButton>
        </div>

        <template v-else>
            <div v-if="canExtend" class="reservation-panel__form">
                <label class="reservation-panel__label">
                    Extend by (days, up to {{ extensionMaxDays }})
                    <MvInput
                        size="sm"
                        type="number"
                        :model-value="form.extendDays"
                        @update:model-value="form.extendDays = $event"
                    />
                </label>
                <MvButton variant="secondary" :loading="submitting" @click="handleExtend">
                    Extend reservation
                </MvButton>
            </div>
            <MvButton variant="secondary" :loading="submitting" @click="handleRelease">
                Release reservation
            </MvButton>
        </template>
    </div>
</template>

<style scoped>
.reservation-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.reservation-panel__status {
    display: flex;
    align-items: center;
    gap: 10px;
}

.reservation-panel__expiry {
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.reservation-panel__form {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.reservation-panel__label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
