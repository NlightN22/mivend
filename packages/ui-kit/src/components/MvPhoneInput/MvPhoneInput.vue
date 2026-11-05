<script setup lang="ts">
import { nextTick, ref } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import { applyPhoneInput } from '../../utils/contactFormat';

const props = defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>();

const wrapper = ref<HTMLElement | null>(null);

function onInput(raw: string): void {
    const input = wrapper.value?.querySelector('input') ?? null;
    const caret = input?.selectionStart ?? raw.length;
    const result = applyPhoneInput(props.modelValue, raw, caret);
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
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            :maxlength="18"
            :placeholder="placeholder ?? '+7 (___) ___-__-__'"
            :disabled="disabled"
            :error="error"
            @update:model-value="onInput"
        />
    </div>
</template>
