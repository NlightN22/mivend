<script setup lang="ts">
import { ref } from 'vue';
import { MvInput, MvNotice, MvButton } from '@mivend/ui-kit';
import { requestPriceAdjustment, type DraftOrderLine } from '../../api/orderCreate';

const props = defineProps<{ orderId: string; line: DraftOrderLine }>();
const emit = defineEmits<{
    applied: [decision: 'apply-directly' | 'requires-approval'];
    close: [];
}>();

const adjustment = ref('');
const justification = ref('');
const submitting = ref(false);
const result = ref<'apply-directly' | 'requires-approval' | null>(null);
const error = ref('');

async function submit(): Promise<void> {
    const delta = Number(adjustment.value);
    if (Number.isNaN(delta) || delta === 0) return;
    submitting.value = true;
    error.value = '';
    try {
        const requestedPrice = props.line.unitPriceWithTax + Math.round(delta * 100);
        const outcome = await requestPriceAdjustment(
            props.orderId,
            props.line.id,
            requestedPrice,
            justification.value || undefined,
        );
        result.value = outcome.decision;
        emit('applied', outcome.decision);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not submit price adjustment';
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div class="price-adjustment">
        <div v-if="!result" class="price-adjustment__form">
            <label class="price-adjustment__label">
                Adjustment (negative = discount, positive = markup)
            </label>
            <MvInput
                size="sm"
                type="number"
                :model-value="adjustment"
                placeholder="-500"
                @update:model-value="adjustment = $event"
            />
            <label class="price-adjustment__label">Justification</label>
            <MvInput
                size="sm"
                :model-value="justification"
                placeholder="Required if this needs approval"
                @update:model-value="justification = $event"
            />
            <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
            <div class="price-adjustment__actions">
                <MvButton size="sm" :loading="submitting" @click="submit">Apply</MvButton>
                <button type="button" class="price-adjustment__cancel" @click="emit('close')">
                    Cancel
                </button>
            </div>
        </div>

        <div v-else-if="result === 'apply-directly'" class="price-adjustment__result price-adjustment__result--ok">
            ✓ Within self-service limit — applied immediately.
        </div>
        <div v-else class="price-adjustment__result price-adjustment__result--warn">
            ⚠ Below floor price — requires approval. This order will be saved as a draft pending
            approval.
        </div>
    </div>
</template>

<style scoped>
.price-adjustment {
    background: var(--el-fill-color-light, #f8fafc);
    border-radius: var(--app-radius-md, 12px);
    padding: 12px 14px;
    margin: 8px 0;
}

.price-adjustment__form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 360px;
}

.price-adjustment__label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary, #6b7280);
    margin-top: 6px;
}

.price-adjustment__actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
}

.price-adjustment__cancel {
    background: none;
    border: none;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    cursor: pointer;
}

.price-adjustment__result {
    font-size: 13px;
    font-weight: 600;
    padding: 6px 0;
}

.price-adjustment__result--ok {
    color: #047857;
}

.price-adjustment__result--warn {
    color: #b45309;
}
</style>
