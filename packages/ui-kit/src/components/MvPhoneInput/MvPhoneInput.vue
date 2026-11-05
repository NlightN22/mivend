<script setup lang="ts">
import { nextTick, ref } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import {
    caretAfterDigits,
    digitsBeforeCaret,
    formatRuPhone,
    nationalPhoneDigits,
} from '../../utils/contactFormat';

defineProps<{ modelValue: string; placeholder?: string; disabled?: boolean; error?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>();

const wrapper = ref<HTMLElement | null>(null);

function onInput(raw: string): void {
    const input = wrapper.value?.querySelector('input') ?? null;
    const caret = input?.selectionStart ?? raw.length;
    const wasAtEnd = caret >= raw.length;
    const digitsLeft = digitsBeforeCaret(raw, caret);
    const formatted = nationalPhoneDigits(raw).length ? formatRuPhone(raw) : '';
    emit('update:modelValue', formatted);
    if (!input) return;
    input.value = formatted;
    nextTick(() => {
        const pos = wasAtEnd ? formatted.length : caretAfterDigits(formatted, digitsLeft);
        input.setSelectionRange(pos, pos);
    });
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
