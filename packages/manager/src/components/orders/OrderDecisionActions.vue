<script setup lang="ts">
import { ref } from 'vue';
import { MvButton, MvInput, MvModal, MvNotice } from '@mivend/ui-kit';
import { useOrderDecision } from '../../composables/useOrderDecision';
import { findingTitle } from '../../utils/orderCheckMessages';

const props = defineProps<{ orderId: string }>();
const emit = defineEmits<{ decided: [] }>();

const rejectOpen = ref(false);
const d = useOrderDecision(
    () => props.orderId,
    () => emit('decided'),
);

async function reject(): Promise<void> {
    if (await d.reject()) rejectOpen.value = false;
}
</script>

<template>
    <section
        v-if="d.canConfirm.value || d.canReject.value || d.loadError.value"
        class="order-decision"
        data-testid="order-decision"
    >
        <MvNotice v-if="d.loadError.value" variant="error">{{ d.loadError.value }}</MvNotice>
        <template v-if="d.canConfirm.value">
            <MvNotice v-if="d.findings.value.length" variant="warning">
                <ul class="order-decision__findings" data-testid="order-decision-findings">
                    <li v-for="f in d.findings.value" :key="f.id">
                        {{ findingTitle(f.messageKey) }}
                    </li>
                </ul>
            </MvNotice>
            <label class="order-decision__label">
                Reservation period (days)
                <MvInput
                    size="sm"
                    type="number"
                    :model-value="d.days.value"
                    @update:model-value="d.days.value = $event"
                />
            </label>
            <MvNotice v-if="d.confirmError.value" variant="error">{{
                d.confirmError.value
            }}</MvNotice>
            <MvButton :loading="d.confirming.value" @click="d.confirm">Confirm order</MvButton>
        </template>
        <MvButton
            v-if="d.canReject.value"
            variant="secondary"
            data-testid="order-reject"
            @click="rejectOpen = true"
            >Reject order</MvButton
        >
        <MvModal v-if="rejectOpen" title="Reject order?" @close="rejectOpen = false">
            <p>The order will be cancelled. This cannot be undone.</p>
            <MvNotice v-if="d.rejectError.value" variant="error">{{
                d.rejectError.value
            }}</MvNotice>
            <div class="order-decision__actions">
                <MvButton variant="secondary" @click="rejectOpen = false">Keep order</MvButton>
                <MvButton variant="danger" :loading="d.rejecting.value" @click="reject"
                    >Yes, reject</MvButton
                >
            </div>
        </MvModal>
    </section>
</template>

<style scoped>
.order-decision {
    display: grid;
    gap: 10px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--el-border-color);
}

.order-decision__label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    color: var(--app-text-grey);
}

.order-decision__findings {
    margin: 0;
    padding-left: 18px;
}

.order-decision__actions {
    display: flex;
    gap: 12px;
    margin-top: 12px;
}
</style>
