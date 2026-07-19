<script setup lang="ts">
// Renders directly as the already-open filter popover's content (the surrounding PrimeVue
// Column-filter overlay owns open/close via its own funnel icon) — no nested trigger/popover of
// its own, unlike MvColumnFilterSelect (which stays compact/closed by design — see its own doc
// comment for why those two differ).
import MvDatePicker from '../MvDatePicker/MvDatePicker.vue';
import type { SingleDateFilterConfig } from './columnFilterTypes';

defineProps<{ config: SingleDateFilterConfig; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
    <MvDatePicker :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
</template>
