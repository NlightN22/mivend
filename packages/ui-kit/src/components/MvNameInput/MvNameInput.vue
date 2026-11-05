<script setup lang="ts">
import MvInput from '../MvInput/MvInput.vue';
import { formatPersonName } from '../../utils/contactFormat';

defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
    autocomplete?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>();
</script>

<template>
    <div @focusout="emit('blur')">
        <MvInput
            :model-value="modelValue"
            :maxlength="100"
            :autocomplete="autocomplete ?? 'name'"
            :placeholder="placeholder"
            :disabled="disabled"
            :error="error"
            @update:model-value="emit('update:modelValue', formatPersonName($event))"
        />
    </div>
</template>
