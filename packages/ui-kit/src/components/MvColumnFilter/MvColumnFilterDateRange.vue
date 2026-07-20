<script setup lang="ts">
// Presets apply instantly the moment they're picked from the dropdown. "Custom range" reveals a
// real Element Plus daterange picker — el-date-picker already handles everything a hand-rolled
// version kept needing follow-up fixes for: manual typing with select-all-on-focus, a visual
// "band" between the two picked days, one built-in clear affordance, and auto-closing once both
// ends of the range are picked (no separate Apply step needed — matches how presets already
// apply instantly). Element Plus is already a real ui-kit dependency (see MvTable.vue's
// ElTableV2/ElAutoResizer) — not a new library.
import { computed, ref, watch } from 'vue';
import { ElDatePicker } from 'element-plus';
import { DATE_RANGE_PRESETS, resolveDateRangePreset } from './dateRangePresets';
import type { DateRangeFilterConfig, DateRangeFilterValue } from './columnFilterTypes';

const props = defineProps<{ config: DateRangeFilterConfig; modelValue: DateRangeFilterValue }>();
const emit = defineEmits<{ 'update:modelValue': [value: DateRangeFilterValue] }>();

const presets = computed(() => props.config.presets ?? DATE_RANGE_PRESETS);

const selectedPreset = ref(props.modelValue.preset || presets.value[0]?.key || '');
// `value-format="YYYY-MM-DD"` makes el-date-picker emit/accept plain ISO strings directly — no
// Date-object round-tripping needed to match DateRangeFilterValue's own from/to shape.
const customRange = ref<[string, string] | null>(
    props.modelValue.from && props.modelValue.to ? [props.modelValue.from, props.modelValue.to] : null,
);
watch(
    () => props.modelValue,
    v => {
        selectedPreset.value = v.preset || presets.value[0]?.key || '';
        customRange.value = v.from && v.to ? [v.from, v.to] : null;
    },
);

const isCustom = computed(() => selectedPreset.value === 'custom');

function onPresetChange(): void {
    if (selectedPreset.value === 'custom') return; // wait for the user to actually pick a range
    const { from, to } = resolveDateRangePreset(selectedPreset.value);
    emit('update:modelValue', { preset: selectedPreset.value, from, to });
}
function onRangeChange(value: [string, string] | null): void {
    customRange.value = value;
    emit('update:modelValue', { preset: 'custom', from: value?.[0] ?? '', to: value?.[1] ?? '' });
}
function onClearAll(): void {
    selectedPreset.value = presets.value[0]?.key ?? '';
    customRange.value = null;
    emit('update:modelValue', { preset: '', from: '', to: '' });
}
</script>

<template>
    <div class="mv-column-filter-date-range">
        <select v-model="selectedPreset" class="mv-column-filter-date-range__select" @change="onPresetChange">
            <option v-for="preset in presets" :key="preset.key" :value="preset.key">{{ preset.label }}</option>
        </select>

        <ElDatePicker
            v-if="isCustom"
            :model-value="customRange"
            type="daterange"
            range-separator="→"
            start-placeholder="From"
            end-placeholder="To"
            format="DD.MM.YYYY"
            value-format="YYYY-MM-DD"
            class="mv-column-filter-date-range__picker"
            @update:model-value="onRangeChange"
        />
        <button v-else-if="modelValue.preset" type="button" class="mv-column-filter-date-range__clear-all" @click="onClearAll">
            Clear
        </button>
    </div>
</template>

<style scoped>
.mv-column-filter-date-range {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 300px;
}

.mv-column-filter-date-range__select {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light, #f8fafc);
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary, #17212b);
}

.mv-column-filter-date-range__picker {
    width: 100%;
}

.mv-column-filter-date-range__clear-all {
    align-self: flex-start;
    border: none;
    background: transparent;
    color: var(--el-color-primary, #00b894);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
}
</style>
