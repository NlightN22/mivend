<script setup lang="ts">
import { useId } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import type { InputSize } from '../MvInput/MvInput.vue';
import { WORKING_HOURS_MAX_LENGTH } from '../../utils/fieldValidation';

const DEFAULT_PRESETS = [
    'Mon-Fri 9:00-18:00',
    'Mon-Fri 8:00-17:00',
    'Mon-Sat 9:00-18:00',
    'Daily 9:00-21:00',
    'Daily, round the clock',
];

withDefaults(
    defineProps<{
        modelValue: string;
        placeholder?: string;
        disabled?: boolean;
        error?: boolean;
        size?: InputSize;
        presets?: string[];
    }>(),
    { presets: () => DEFAULT_PRESETS },
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
            :maxlength="WORKING_HOURS_MAX_LENGTH"
            :placeholder="placeholder"
            :disabled="disabled"
            :error="error"
            :size="size"
            @update:model-value="emit('update:modelValue', $event)"
        />
        <datalist :id="listId">
            <option v-for="preset in presets" :key="preset" :value="preset" />
        </datalist>
    </div>
</template>
