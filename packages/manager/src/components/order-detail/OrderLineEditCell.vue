<script setup lang="ts">
import { ref } from 'vue';
import { MvButton, MvQtyStepper } from '@mivend/ui-kit';
import { stepperMin, stepperOutcome } from '../../composables/orderLineStepper';

const props = defineProps<{ quantity: number; step: number; canRemove: boolean; busy: boolean }>();
const emit = defineEmits<{ save: [quantity: number]; remove: [] }>();

const confirmingRemove = ref(false);

// Stepping down to zero asks to remove the line, as in the storefront cart; the last line cannot go to zero.
function onChange(value: number): void {
    const outcome = stepperOutcome(value, props.quantity, props.canRemove);
    if (outcome?.kind === 'confirm-remove') confirmingRemove.value = true;
    else if (outcome?.kind === 'save') emit('save', outcome.quantity);
}

function confirmRemove(): void {
    confirmingRemove.value = false;
    emit('remove');
}
</script>

<template>
    <div class="line-edit">
        <div v-if="confirmingRemove" class="line-edit__confirm">
            <span>Remove?</span>
            <MvButton variant="danger" size="sm" :disabled="busy" @click="confirmRemove"
                >Yes</MvButton
            >
            <MvButton variant="secondary" size="sm" @click="confirmingRemove = false">No</MvButton>
        </div>
        <MvQtyStepper
            v-else
            editable
            size="sm"
            :model-value="quantity"
            :min="stepperMin(canRemove, step)"
            :step="step"
            :disabled="busy"
            @update:model-value="onChange"
        />
    </div>
</template>

<style scoped>
.line-edit {
    display: flex;
    justify-content: center;
}

.line-edit__confirm {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 800;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
