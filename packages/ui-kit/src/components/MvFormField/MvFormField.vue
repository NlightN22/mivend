<script setup lang="ts">
defineProps<{
  label?: string;
  error?: string;
  required?: boolean;
}>();
</script>

<template>
  <div class="mv-field">
    <label v-if="label" class="mv-field__label">
      {{ label }}<span v-if="required" class="mv-field__required" aria-hidden="true">*</span>
    </label>
    <slot />
    <p v-if="error" class="mv-field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.mv-field {
  display: grid;
  gap: 7px;
}

.mv-field__label {
  font-size: 13px;
  font-weight: 700;
  color: #3e504a;
  line-height: 1.3;
}

.mv-field__required {
  color: #ef4444;
  margin-left: 2px;
}

.mv-field__error {
  margin: 0;
  font-size: 12px;
  color: #ef4444;
  line-height: 1.35;
}
</style>
