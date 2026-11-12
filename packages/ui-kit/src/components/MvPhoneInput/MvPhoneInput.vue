<script setup lang="ts">
import { nextTick, ref } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import type { InputSize } from '../MvInput/MvInput.vue';
import { applyPhoneInput } from '../../utils/phoneFormat';

const props = defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
    size?: InputSize;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>();

const wrapper = ref<HTMLElement | null>(null);
let inputType = '';

function onInput(raw: string): void {
    const input = wrapper.value?.querySelector('input') ?? null;
    const caret = input?.selectionStart ?? raw.length;
    const deleting = inputType
        ? inputType.startsWith('delete')
        : raw.length < props.modelValue.length;
    const result = applyPhoneInput(props.modelValue, raw, caret, deleting);
    inputType = '';
    emit('update:modelValue', result.value);
    if (!input) return;
    input.value = result.value;
    nextTick(() => input.setSelectionRange(result.caret, result.caret));
}
</script>

<template>
    <div
        ref="wrapper"
        @input.capture="inputType = ($event as InputEvent).inputType ?? ''"
        @focusout="emit('blur')"
    >
        <MvInput
            :model-value="modelValue"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            :maxlength="24"
            :placeholder="placeholder ?? '+7 900 000-00-00'"
            :disabled="disabled"
            :error="error"
            :size="size"
            @update:model-value="onInput"
        />
    </div>
</template>
