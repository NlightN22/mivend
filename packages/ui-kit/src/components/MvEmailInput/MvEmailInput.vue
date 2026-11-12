<script setup lang="ts">
import MvInput from '../MvInput/MvInput.vue';
import type { InputSize } from '../MvInput/MvInput.vue';
import { EMAIL_MAX_LENGTH, formatEmail } from '../../utils/fieldValidation';

defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
    size?: InputSize;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>();
</script>

<template>
    <div @focusout="emit('blur')">
        <MvInput
            :model-value="modelValue"
            type="email"
            inputmode="email"
            autocomplete="email"
            :maxlength="EMAIL_MAX_LENGTH"
            :placeholder="placeholder ?? 'name@example.com'"
            :disabled="disabled"
            :error="error"
            :size="size"
            @update:model-value="emit('update:modelValue', formatEmail($event))"
        />
    </div>
</template>
