<script setup lang="ts">
import { ref } from 'vue';
import MvInput from '../MvInput/MvInput.vue';

defineProps<{
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();

const visible = ref(false);
</script>

<template>
  <div class="mv-pw">
    <MvInput
      :model-value="modelValue"
      :type="visible ? 'text' : 'password'"
      :placeholder="placeholder"
      :disabled="disabled"
      :error="error"
      class="mv-pw__input"
      autocomplete="current-password"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <button
      class="mv-pw__toggle"
      type="button"
      :aria-label="visible ? 'Hide password' : 'Show password'"
      @click="visible = !visible"
    >
      {{ visible ? 'Hide' : 'Show' }}
    </button>
  </div>
</template>

<style scoped>
.mv-pw {
  position: relative;
}

.mv-pw__input {
  padding-right: 88px !important;
}

.mv-pw__toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  min-height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  background: #f3f8f6;
  color: #40514b;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}

.mv-pw__toggle:hover {
  background: #e2f0eb;
}
</style>
