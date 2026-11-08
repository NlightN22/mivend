<script setup lang="ts">
import { onMounted, ref } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import { CODE_LENGTH, normalizeCode } from '../../composables/twoFactor/twoFactorTypes';

const props = defineProps<{ modelValue: string; error?: boolean; autofocus?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const input = ref<InstanceType<typeof MvInput> | null>(null);

function update(raw: string): void {
    const value = normalizeCode(raw);
    emit('update:modelValue', value);
    const el = input.value?.$el as HTMLInputElement | undefined;
    if (el && el.value !== value) el.value = value;
}

onMounted(() => {
    if (props.autofocus) (input.value?.$el as HTMLInputElement | undefined)?.focus();
});
</script>

<template>
    <MvInput
        ref="input"
        class="mv-otp-input"
        :model-value="modelValue"
        :error="error"
        inputmode="numeric"
        autocomplete="one-time-code"
        :placeholder="'0'.repeat(CODE_LENGTH)"
        @update:model-value="update"
    />
</template>

<style scoped>
.mv-otp-input {
    text-align: center;
    font-size: 24px;
    letter-spacing: 0.4em;
    font-variant-numeric: tabular-nums;
}
</style>
