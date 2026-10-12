<script setup lang="ts">
import { computed } from 'vue';
import { MvButton, MvNotice } from '@mivend/ui-kit';
import { usePaymentReceived } from '../../composables/usePaymentReceived';

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
    pending.value?.method === 'cash' ? 'Cash received' : 'Bank transfer received',
);
</script>

<template>
    <div v-if="allowed && pending" class="payment-received">
        <MvButton :loading="confirming" @click="confirm">{{ label }}</MvButton>
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
    </div>
</template>

<style scoped>
.payment-received {
    display: grid;
    gap: 8px;
}
</style>
