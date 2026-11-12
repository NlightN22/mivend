<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvDocumentSuffixInput } from '@mivend/ui-kit';

const { t } = useI18n();
defineProps<{
    price: string;
    justification: string;
    symbol: string;
    needsReason: boolean;
    disabled: boolean;
}>();
defineEmits<{ 'update:price': [value: string]; 'update:justification': [value: string] }>();
</script>

<template>
    <div class="price-edit">
        <MvDocumentSuffixInput
            :model-value="price"
            :suffix="symbol"
            :label="t('orderLines.line.unitPrice')"
            :disabled="disabled"
            @update:model-value="$emit('update:price', $event)"
        />
        <input
            v-if="needsReason"
            class="price-edit__reason"
            :value="justification"
            :disabled="disabled"
            :placeholder="t('orderLines.line.reasonForApproval')"
            :aria-label="t('orderLines.line.reasonForApproval')"
            data-testid="price-reason"
            @input="$emit('update:justification', ($event.target as HTMLInputElement).value)"
        />
    </div>
</template>

<style scoped>
.price-edit {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.price-edit__reason {
    width: 100px;
    padding: 2px 6px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-surface);
    color: inherit;
    font: inherit;
    font-size: 12px;
}
</style>
