<script setup lang="ts">
import { MvNotice } from '@mivend/ui-kit';

export type ActivationAction = 'activate' | 'deactivate';

const props = defineProps<{ modelValue: Record<string, unknown> }>();
const emit = defineEmits<{ 'update:modelValue': [parameters: Record<string, unknown>] }>();

const OPTIONS: Array<{ value: ActivationAction; title: string; text: string }> = [
    {
        value: 'activate',
        title: 'Grant portal access',
        text: 'Creates a customer login from the counterparty phone and e-mail. The counterparty sets its own password from the e-mail link.',
    },
    {
        value: 'deactivate',
        title: 'Revoke portal access',
        text: 'Deactivates the linked customer login. A revoke cannot be undone: granting again creates a new login.',
    },
];
</script>

<template>
    <div class="activation-parameters">
        <fieldset class="activation-parameters__group">
            <legend class="activation-parameters__legend">
                What to do with the selected counterparties
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
            Records that cannot change (already in the target state, missing contact data, outside
            your scope) are skipped and listed on the next step.
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
