<script setup lang="ts">
import { MvButton, MvInput } from '@mivend/ui-kit';

defineProps<{ days: string; submitting: boolean }>();
const emit = defineEmits<{ 'update:days': [value: string]; submit: [] }>();
</script>

<template>
    <div class="confirm-form">
        <label class="confirm-form__label">
            Reservation period (days)
            <MvInput
                size="sm"
                type="number"
                :model-value="days"
                @update:model-value="emit('update:days', $event)"
            />
        </label>
        <MvButton :loading="submitting" @click="emit('submit')">Confirm</MvButton>
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
