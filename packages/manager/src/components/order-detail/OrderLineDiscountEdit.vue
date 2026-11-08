<script setup lang="ts">
import { MvDocumentSuffixInput } from '@mivend/ui-kit';
import type { CapHint } from '../../utils/lineValueModel';

defineProps<{ percent: string; hint: CapHint; disabled: boolean }>();
defineEmits<{ 'update:percent': [value: string] }>();
</script>

<template>
    <div class="discount-edit">
        <MvDocumentSuffixInput
            :model-value="percent"
            suffix="%"
            label="Discount percent"
            :invalid="hint.kind === 'approval'"
            :disabled="disabled"
            @update:model-value="$emit('update:percent', $event)"
        />
        <span
            v-if="hint.text"
            class="discount-edit__hint"
            :class="{ 'discount-edit__hint--approval': hint.kind === 'approval' }"
            data-testid="discount-hint"
        >
            {{ hint.text }}
        </span>
    </div>
</template>

<style scoped>
.discount-edit {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 150px;
}

.discount-edit__hint {
    font-size: 12px;
    white-space: normal;
    color: var(--app-text-grey);
}

.discount-edit__hint--approval {
    color: var(--app-danger-fg);
}
</style>
