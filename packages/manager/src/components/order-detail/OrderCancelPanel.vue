<script setup lang="ts">
import { computed, ref } from 'vue';
import { MvButton, MvModal, MvNotice } from '@mivend/ui-kit';
import { isCancellable, useCancelOrderAsStaff } from '../../composables/useCancelOrderAsStaff';

const props = defineProps<{ orderId: string; state: string; erpStatus: string | null }>();
const emit = defineEmits<{ cancelled: [] }>();

const confirmOpen = ref(false);
const { allowed, cancelling, error, cancel } = useCancelOrderAsStaff(
    () => props.orderId,
    () => emit('cancelled'),
);
const visible = computed(() => allowed.value && isCancellable(props.state, props.erpStatus));

async function confirm(): Promise<void> {
    await cancel();
    confirmOpen.value = false;
}
</script>

<template>
    <div v-if="visible" class="order-cancel">
        <MvButton variant="secondary" @click="confirmOpen = true">Cancel order</MvButton>
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
        <MvModal v-if="confirmOpen" title="Cancel order?" @close="confirmOpen = false">
            <p>The order will be cancelled. This cannot be undone.</p>
            <div class="order-cancel__actions">
                <MvButton variant="secondary" @click="confirmOpen = false">Keep order</MvButton>
                <MvButton variant="danger" :loading="cancelling" @click="confirm"
                    >Yes, cancel</MvButton
                >
            </div>
        </MvModal>
    </div>
</template>

<style scoped>
.order-cancel {
    display: grid;
    gap: 8px;
}
.order-cancel__actions {
    display: flex;
    gap: 12px;
}
</style>
