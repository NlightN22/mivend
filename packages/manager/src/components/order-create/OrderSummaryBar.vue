<script setup lang="ts">
import { MvButton, MvNotice } from '@mivend/ui-kit';

const props = defineProps<{
    subTotalWithTax: number;
    totalWithTax: number;
    currencyCode: string;
    hasPendingApproval: boolean;
    disabled: boolean;
    submitting: boolean;
}>();
const emit = defineEmits<{ submit: [] }>();

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: props.currencyCode,
    }).format(amount / 100);
}
</script>

<template>
    <div class="summary-bar">
        <MvNotice v-if="hasPendingApproval" variant="warning" class="summary-bar__notice">
            This order includes a price adjustment pending approval — it won't ship until approved.
        </MvNotice>
        <div class="summary-bar__totals">
            <span>Subtotal: {{ money(subTotalWithTax) }}</span>
            <strong>Total: {{ money(totalWithTax) }}</strong>
        </div>
        <MvButton :disabled="disabled" :loading="submitting" @click="emit('submit')">
            {{ hasPendingApproval ? 'Save as draft & submit for approval' : 'Place order' }}
        </MvButton>
    </div>
</template>

<style scoped>
.summary-bar {
    position: sticky;
    bottom: 0;
    background: #fff;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-lg, 16px);
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 20px;
    box-shadow: var(--app-shadow-md, 0 10px 28px rgba(16, 24, 40, 0.08));
}

.summary-bar__notice {
    flex: 1;
}

.summary-bar__totals {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
    margin-left: auto;
    white-space: nowrap;
}
</style>
