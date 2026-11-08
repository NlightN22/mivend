<script setup lang="ts">
import { computed, ref } from 'vue';
import { MvActionMenu, MvButton, MvInput, MvModal, MvNotice, MvPopover } from '@mivend/ui-kit';
import type { RelatedDocument } from '../../api/orderDetail';
import type { OrderHeaderCommands } from '../../composables/useOrderHeaderCommands';
import type { useReservationActions } from '../../composables/useReservationActions';
import OrderConfirmForm from './OrderConfirmForm.vue';
import OrderDocumentsModal from './OrderDocumentsModal.vue';
import OrderProformaModal from './OrderProformaModal.vue';

const props = defineProps<{
    orderId: string;
    orderCode: string;
    cancelled: boolean;
    documents: RelatedDocument[];
    commands: OrderHeaderCommands;
    reservation: ReturnType<typeof useReservationActions>;
}>();
const emit = defineEmits<{ recompute: [] }>();

const proformasOpen = ref(false);
const documentsOpen = ref(false);
const { mobile, confirmOpen, extendOpen, cancelOpen, cancelFlow, actions } = props.commands;
const error = computed(() => props.reservation.error.value || cancelFlow.error.value);

async function submitConfirm(): Promise<void> {
    if (await props.reservation.confirm()) confirmOpen.value = false;
}

async function submitExtend(): Promise<void> {
    if (await props.reservation.extend()) extendOpen.value = false;
}

async function submitCancel(): Promise<void> {
    await cancelFlow.cancel();
    cancelOpen.value = false;
}

function onMenu(key: string): void {
    if (key === 'recompute') emit('recompute');
    else if (key === 'release') void props.reservation.release();
    else if (key === 'extend') extendOpen.value = true;
    else if (key === 'confirm') confirmOpen.value = true;
    else if (key === 'cancel') cancelOpen.value = true;
    else if (key === 'proformas') proformasOpen.value = true;
    else if (key === 'documents') documentsOpen.value = true;
}
</script>

<template>
    <div class="header-actions">
        <MvPopover v-if="actions.confirm" v-model:open="confirmOpen">
            <template #trigger>
                <MvButton aria-label="Confirm order">Confirm</MvButton>
            </template>
            <OrderConfirmForm
                v-model:days="reservation.form.days"
                :submitting="reservation.submitting.value"
                @submit="submitConfirm"
            />
        </MvPopover>
        <MvButton
            v-if="actions.cancel"
            variant="secondary"
            aria-label="Cancel order"
            @click="cancelOpen = true"
        >
            Cancel
        </MvButton>
        <MvActionMenu :items="actions.menu" @select="onMenu" />
    </div>
    <MvNotice v-if="error" variant="error" class="header-actions__error">{{ error }}</MvNotice>

    <OrderProformaModal
        v-if="proformasOpen"
        :order-id="orderId"
        :order-code="orderCode"
        :cancelled="cancelled"
        @close="proformasOpen = false"
    />
    <OrderDocumentsModal
        v-if="documentsOpen"
        :documents="documents"
        @close="documentsOpen = false"
    />
    <MvModal v-if="mobile && confirmOpen" title="Confirm order" @close="confirmOpen = false">
        <OrderConfirmForm
            v-model:days="reservation.form.days"
            :submitting="reservation.submitting.value"
            @submit="submitConfirm"
        />
    </MvModal>
    <MvModal v-if="extendOpen" title="Extend reservation" @close="extendOpen = false">
        <div class="header-actions__extend">
            <label class="header-actions__label">
                Extend by (days, up to {{ reservation.extensionMaxDays.value }})
                <MvInput
                    size="sm"
                    type="number"
                    :model-value="reservation.form.extendDays"
                    @update:model-value="reservation.form.extendDays = $event"
                />
            </label>
            <MvButton :loading="reservation.submitting.value" @click="submitExtend">
                Extend reservation
            </MvButton>
        </div>
    </MvModal>
    <MvModal v-if="cancelOpen" title="Cancel order?" @close="cancelOpen = false">
        <p>The order will be cancelled. This cannot be undone.</p>
        <div class="header-actions__row">
            <MvButton variant="secondary" @click="cancelOpen = false">Keep order</MvButton>
            <MvButton variant="danger" :loading="cancelFlow.cancelling.value" @click="submitCancel">
                Yes, cancel
            </MvButton>
        </div>
    </MvModal>
</template>

<style scoped>
.header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.header-actions__error {
    margin-top: 8px;
}

.header-actions__extend {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.header-actions__label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--app-text-grey);
}

.header-actions__row {
    display: flex;
    gap: 12px;
}
</style>
