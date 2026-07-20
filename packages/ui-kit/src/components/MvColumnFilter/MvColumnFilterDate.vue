<script setup lang="ts">
// Same reasoning as MvColumnFilterDateRange.vue's own doc comment: a real Element Plus date
// picker (already a ui-kit dependency, see MvTable.vue's ElTableV2) instead of a hand-rolled
// calendar, for manual typing + a well-tested picker UX with no extra library.
import { ElDatePicker } from 'element-plus';
import type { SingleDateFilterConfig } from './columnFilterTypes';

defineProps<{ config: SingleDateFilterConfig; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
    <ElDatePicker
        :model-value="modelValue || null"
        type="date"
        format="DD.MM.YYYY"
        value-format="YYYY-MM-DD"
        style="width: 100%"
        @update:model-value="(value) => emit('update:modelValue', (value as string | null) ?? '')"
    />
</template>
