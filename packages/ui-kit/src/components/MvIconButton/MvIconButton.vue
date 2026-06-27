<script setup lang="ts">
export type IconButtonVariant = 'default' | 'primary' | 'orange';

defineProps<{
    label: string;
    variant?: IconButtonVariant;
    title?: string;
}>();
</script>

<template>
  <button
    class="mv-icon-btn"
    :class="`mv-icon-btn--${variant ?? 'default'}`"
    :title="title ?? label"
    type="button"
  >
    <span class="mv-icon-btn__icon"><slot /></span>
    <span class="mv-icon-btn__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.mv-icon-btn {
  border: 0;
  width: 52px;
  padding: 8px 4px 6px;
  border-radius: 12px;
  font: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  transition: background 0.14s, color 0.14s;
  background: #f3f8f6;
  color: #4a5e57;
}

.mv-icon-btn:hover { background: #e2f8ef; color: #008a64; }

.mv-icon-btn--primary { background: #e2f8ef; color: #008a64; }
.mv-icon-btn--primary:hover { background: #c6f0df; }

.mv-icon-btn--orange { background: #fff0df; color: #e87800; }
.mv-icon-btn--orange:hover { background: #ffe0bf; }

.mv-icon-btn__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
}

.mv-icon-btn__label {
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}
</style>
