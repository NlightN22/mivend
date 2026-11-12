<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvNotice, MvPopover, MvStatusBadge } from '@mivend/ui-kit';
import { usePaymentReceived } from '../../composables/usePaymentReceived';

const { t } = useI18n();
const props = defineProps<{
    orderId: string;
    payments: Array<{ method: string; state: string }>;
}>();
const emit = defineEmits<{ confirmed: [] }>();

const MANUAL_METHODS = ['cash', 'offline-terms'];
const { allowed, confirming, error, confirm } = usePaymentReceived(
    () => props.orderId,
    () => emit('confirmed'),
);
const pending = computed(() =>
    props.payments.find(p => MANUAL_METHODS.includes(p.method) && p.state === 'Authorized'),
);
const label = computed(() =>
    pending.value?.method === 'cash'
        ? t('orderDetail.payment.cashReceived')
        : t('orderDetail.payment.transferReceived'),
);
</script>

<template>
    <MvPopover v-if="allowed && pending">
        <template #trigger>
            <button
                type="button"
                class="payment-received__trigger"
                :aria-label="t('orderDetail.payment.awaiting')"
            >
                <MvStatusBadge variant="warning">{{
                    t('orderDetail.payment.awaiting')
                }}</MvStatusBadge>
            </button>
        </template>
        <span>{{ t('orderDetail.payment.hint') }}</span>
        <MvButton :loading="confirming" @click="confirm">{{ label }}</MvButton>
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
    </MvPopover>
</template>

<style scoped>
.payment-received__trigger {
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
}
</style>
