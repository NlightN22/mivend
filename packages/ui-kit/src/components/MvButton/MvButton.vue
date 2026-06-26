<script setup lang="ts">
export type ButtonVariant = 'primary' | 'secondary' | 'catalog' | 'buy' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

function handleClick(event: MouseEvent): void {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
}
</script>

<template>
  <button
    :class="[
      'mv-button',
      `mv-button--${variant}`,
      `mv-button--${size}`,
      { 'mv-button--disabled': disabled, 'mv-button--loading': loading },
    ]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="mv-button__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.mv-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  cursor: pointer;
  font-family: var(--app-font-family, Inter, system-ui, sans-serif);
  font-size: var(--app-font-size-button, 14px);
  font-weight: 700;
  border-radius: var(--app-radius-md, 12px);
  transition: background 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  white-space: nowrap;
  line-height: 1;
}

.mv-button--sm { height: 32px; padding: 0 12px; font-size: 13px; border-radius: var(--app-radius-sm, 8px); }
.mv-button--md { height: 40px; padding: 0 18px; }
.mv-button--lg { height: 48px; padding: 0 24px; font-size: 16px; border-radius: var(--app-radius-lg, 16px); }

.mv-button--primary {
  background: #00B894;
  color: #fff;
}
.mv-button--primary:hover:not(:disabled) { background: #00A884; }
.mv-button--primary:active:not(:disabled) { background: #008A70; }

.mv-button--secondary {
  background: #fff;
  color: #17212B;
  border: 1.5px solid #E4E7EC;
}
.mv-button--secondary:hover:not(:disabled) {
  background: #F6F8FB;
  border-color: #00B894;
  color: #00B894;
}
.mv-button--secondary:active:not(:disabled) { background: #F0FFFA; }

.mv-button--catalog {
  background: #C8F21A;
  color: #1B2500;
}
.mv-button--catalog:hover:not(:disabled) {
  background: #B8E010;
  box-shadow: 0 8px 18px rgba(200, 242, 26, 0.35);
}
.mv-button--catalog:active:not(:disabled) { background: #A8CC0A; }

.mv-button--buy {
  background: #FF8A00;
  color: #fff;
}
.mv-button--buy:hover:not(:disabled) { background: #E67C00; }
.mv-button--buy:active:not(:disabled) { background: #CC6E00; }

.mv-button--ghost {
  background: transparent;
  color: #00B894;
  border: 1.5px solid #00B894;
}
.mv-button--ghost:hover:not(:disabled) { background: #F0FFFA; }
.mv-button--ghost:active:not(:disabled) { background: #C8F7EC; }

.mv-button--danger {
  background: #EF4444;
  color: #fff;
}
.mv-button--danger:hover:not(:disabled) { background: #DC2626; }
.mv-button--danger:active:not(:disabled) { background: #B91C1C; }

.mv-button--disabled,
.mv-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

.mv-button--loading {
  cursor: wait;
  pointer-events: none;
}

.mv-button__spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: mv-spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes mv-spin {
  to { transform: rotate(360deg); }
}
</style>
