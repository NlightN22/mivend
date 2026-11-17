<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvCheckbox, MvNotice } from '@mivend/ui-kit';

const props = defineProps<{ modelValue: Record<string, unknown> }>();
const emit = defineEmits<{ 'update:modelValue': [parameters: Record<string, unknown>] }>();

const { t } = useI18n();
</script>

<template>
    <div class="manager-remove">
        <MvNotice variant="warning">{{ t('bulkOperations.managerRemove.notice') }}</MvNotice>
        <MvCheckbox
            :model-value="props.modelValue.confirmed === true"
            :label="t('bulkOperations.managerRemove.confirm')"
            data-testid="remove-confirm"
            @update:model-value="emit('update:modelValue', { confirmed: $event })"
        />
    </div>
</template>

<style scoped>
.manager-remove {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 720px;
}
</style>
