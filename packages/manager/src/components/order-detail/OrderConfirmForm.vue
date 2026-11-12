<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvButton, MvInput } from '@mivend/ui-kit';

const { t } = useI18n();
defineProps<{ days: string; submitting: boolean }>();
const emit = defineEmits<{ 'update:days': [value: string]; submit: [] }>();
</script>

<template>
    <div class="confirm-form">
        <label class="confirm-form__label">
            {{ t('orderDetail.confirm.period') }}
            <MvInput
                size="sm"
                type="number"
                :model-value="days"
                @update:model-value="emit('update:days', $event)"
            />
        </label>
        <MvButton :loading="submitting" @click="emit('submit')">{{ t('orderDetail.actions.confirm') }}</MvButton>
    </div>
</template>

<style scoped>
.confirm-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.confirm-form__label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--app-text-grey);
}
</style>
