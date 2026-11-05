<script setup lang="ts">
import { nextTick, ref } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import { applyNameInput } from '../../utils/contactFormat';

defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
    autocomplete?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>();

const wrapper = ref<HTMLElement | null>(null);

function onInput(raw: string): void {
    const input = wrapper.value?.querySelector('input') ?? null;
    const result = applyNameInput(raw, input?.selectionStart ?? raw.length);
    emit('update:modelValue', result.value);
    if (!input) return;
    input.value = result.value;
    nextTick(() => input.setSelectionRange(result.caret, result.caret));
}
</script>

<template>
    <div ref="wrapper" @focusout="emit('blur')">
        <MvInput
            :model-value="modelValue"
            :maxlength="100"
            :autocomplete="autocomplete ?? 'name'"
            :placeholder="placeholder"
            :disabled="disabled"
            :error="error"
            @update:model-value="onInput"
        />
    </div>
</template>
