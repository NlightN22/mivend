<script setup lang="ts">
defineProps<{
  modelValue: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  autocomplete?: string;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <input
    :class="['mv-input', { 'mv-input--error': error, 'mv-input--disabled': disabled }]"
    :type="type ?? 'text'"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :autocomplete="autocomplete"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.mv-input {
  display: block;
  width: 100%;
  min-height: 52px;
  padding: 0 15px;
  border: 1px solid #e4e7ec;
  border-radius: 16px;
  background: #fff;
  color: #17212b;
  font-size: 15px;
  font-family: var(--app-font-family, Inter, system-ui, sans-serif);
  font-weight: 600;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}

.mv-input::placeholder {
  color: #667085;
  font-weight: 400;
}

.mv-input:focus {
  border-color: #00b894;
  box-shadow: 0 0 0 4px rgba(0, 184, 148, 0.1);
}

.mv-input--error {
  border-color: #ef4444;
}

.mv-input--error:focus {
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.1);
}

.mv-input--disabled {
  opacity: 0.5;
  pointer-events: none;
  background: #f9fafb;
}
</style>
