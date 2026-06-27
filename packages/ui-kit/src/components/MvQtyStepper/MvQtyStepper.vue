<script setup lang="ts">
interface Props {
  modelValue: number;
  min?: number;
  step?: number;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  min: 1,
  step: 1,
  disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [n: number] }>();

function dec() {
  const next = props.modelValue - props.step;
  if (next >= props.min) emit('update:modelValue', next);
}

function inc() {
  emit('update:modelValue', props.modelValue + props.step);
}
</script>

<template>
  <div class="mv-qty-stepper" :class="{ 'mv-qty-stepper--disabled': disabled }">
    <button
      class="mv-qty-stepper__btn"
      type="button"
      :disabled="disabled || modelValue <= min"
      @click="dec"
    >−</button>
    <span class="mv-qty-stepper__val">{{ modelValue }}</span>
    <button
      class="mv-qty-stepper__btn"
      type="button"
      :disabled="disabled"
      @click="inc"
    >+</button>
  </div>
</template>

<style scoped>
.mv-qty-stepper {
  display: inline-flex;
  align-items: center;
  border: 1.5px solid #dde7e2;
  border-radius: 12px;
  overflow: hidden;
  height: 44px;
}

.mv-qty-stepper--disabled { opacity: 0.45; pointer-events: none; }

.mv-qty-stepper__btn {
  width: 38px;
  height: 100%;
  border: none;
  background: transparent;
  font-size: 20px;
  color: #2c3b36;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.1s;
}

.mv-qty-stepper__btn:hover:not(:disabled) { background: #f4faf7; }
.mv-qty-stepper__btn:disabled { opacity: 0.4; cursor: not-allowed; }

.mv-qty-stepper__val {
  min-width: 36px;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: #14231f;
  user-select: none;
}
</style>
