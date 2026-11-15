<script setup lang="ts">
import { useId } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import type { InputSize } from '../MvInput/MvInput.vue';
import { WORKING_HOURS_MAX_LENGTH } from '../../utils/fieldValidation';
import { applyWorkingHoursInput } from '../../utils/workingHoursFormat';

withDefaults(
    defineProps<{
        modelValue: string;
        placeholder?: string;
        disabled?: boolean;
        error?: boolean;
        size?: InputSize;
        presets?: string[];
    }>(),
    { presets: () => [] },
);
const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>();

const listId = `mv-hours-${useId()}`;
</script>

<template>
    <div @focusout="emit('blur')">
        <MvInput
            :model-value="modelValue"
            :list="listId"
            autocomplete="off"
            inputmode="numeric"
            :maxlength="WORKING_HOURS_MAX_LENGTH"
            :placeholder="placeholder ?? '09:00\u201318:00'"
            :disabled="disabled"
            :error="error"
            :size="size"
            @update:model-value="emit('update:modelValue', applyWorkingHoursInput($event))"
        />
        <datalist :id="listId">
            <option v-for="preset in presets" :key="preset" :value="preset" />
        </datalist>
    </div>
</template>
