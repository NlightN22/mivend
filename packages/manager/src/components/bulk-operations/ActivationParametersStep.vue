<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice } from '@mivend/ui-kit';

export type ActivationAction = 'activate' | 'deactivate';

const props = defineProps<{ modelValue: Record<string, unknown> }>();
const emit = defineEmits<{ 'update:modelValue': [parameters: Record<string, unknown>] }>();

const { t } = useI18n();
const OPTIONS = computed<Array<{ value: ActivationAction; title: string; text: string }>>(() => [
    {
        value: 'activate',
        title: t('bulkOperations.activation.activateTitle'),
        text: t('bulkOperations.activation.activateText'),
    },
    {
        value: 'deactivate',
        title: t('bulkOperations.activation.deactivateTitle'),
        text: t('bulkOperations.activation.deactivateText'),
    },
]);
</script>

<template>
    <div class="activation-parameters">
        <fieldset class="activation-parameters__group">
            <legend class="activation-parameters__legend">
                {{ t('bulkOperations.activation.optionsLegend') }}
            </legend>
            <label
                v-for="option in OPTIONS"
                :key="option.value"
                class="activation-parameters__option"
                :class="{
                    'activation-parameters__option--active':
                        props.modelValue.action === option.value,
                }"
            >
                <input
                    type="radio"
                    name="portal-access-action"
                    :value="option.value"
                    :checked="props.modelValue.action === option.value"
                    @change="emit('update:modelValue', { action: option.value })"
                />
                <span>
                    <span class="activation-parameters__title">{{ option.title }}</span>
                    <span class="activation-parameters__text">{{ option.text }}</span>
                </span>
            </label>
        </fieldset>
        <MvNotice variant="info">
            {{ t('bulkOperations.activation.skipNotice') }}
        </MvNotice>
    </div>
</template>

<style scoped>
.activation-parameters {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 720px;
}

.activation-parameters__group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    border: 0;
}

.activation-parameters__legend {
    padding: 0 0 8px;
    font-weight: 600;
}

.activation-parameters__option {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-surface);
    cursor: pointer;
}

.activation-parameters__option--active {
    border-color: var(--el-color-primary);
}

.activation-parameters__title {
    display: block;
    font-weight: 600;
}

.activation-parameters__text {
    display: block;
    margin-top: 2px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
}
</style>
