<script setup lang="ts">
// Presets apply instantly the moment they're picked from the dropdown; only "Custom range"
// reveals From/To fields needing an explicit Apply/Clear (a manually-typed pair of dates is a
// composite condition, same reasoning as amount-range).
import { computed, ref, watch } from 'vue';
import { Close } from '@element-plus/icons-vue';
import MvButton from '../MvButton/MvButton.vue';
import { DATE_RANGE_PRESETS, resolveDateRangePreset } from './dateRangePresets';
import type { DateRangeFilterConfig, DateRangeFilterValue } from './columnFilterTypes';

const props = defineProps<{ config: DateRangeFilterConfig; modelValue: DateRangeFilterValue }>();
const emit = defineEmits<{ 'update:modelValue': [value: DateRangeFilterValue]; close: [] }>();

const presets = computed(() => props.config.presets ?? DATE_RANGE_PRESETS);

const selectedPreset = ref(props.modelValue.preset || presets.value[0]?.key || '');
const customFrom = ref(props.modelValue.from);
const customTo = ref(props.modelValue.to);
watch(
    () => props.modelValue,
    v => {
        selectedPreset.value = v.preset || presets.value[0]?.key || '';
        customFrom.value = v.from;
        customTo.value = v.to;
    },
);

const isCustom = computed(() => selectedPreset.value === 'custom');

function formatDisplayDate(iso: string): string {
    if (!iso) return '';
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const currentRangeLabel = computed(() => {
    if (!customFrom.value && !customTo.value) return '';
    if (customFrom.value && customTo.value) return `${formatDisplayDate(customFrom.value)} – ${formatDisplayDate(customTo.value)}`;
    return formatDisplayDate(customFrom.value || customTo.value);
});

function onPresetChange(): void {
    if (selectedPreset.value === 'custom') return; // wait for the user to actually fill in From/To
    const { from, to } = resolveDateRangePreset(selectedPreset.value);
    emit('update:modelValue', { preset: selectedPreset.value, from, to });
}
function onApplyCustom(): void {
    emit('update:modelValue', { preset: 'custom', from: customFrom.value, to: customTo.value });
}
function onClear(): void {
    selectedPreset.value = presets.value[0]?.key ?? '';
    customFrom.value = '';
    customTo.value = '';
    emit('update:modelValue', { preset: '', from: '', to: '' });
}
</script>

<template>
    <div class="mv-column-filter-date-range">
        <div class="mv-column-filter-date-range__header">
            <span class="mv-column-filter-date-range__title">Date placed</span>
            <button type="button" class="mv-column-filter-date-range__close" aria-label="Close" @click="emit('close')">
                <Close />
            </button>
        </div>

        <select v-model="selectedPreset" class="mv-column-filter-date-range__select" @change="onPresetChange">
            <option v-for="preset in presets" :key="preset.key" :value="preset.key">{{ preset.label }}</option>
        </select>

        <template v-if="isCustom">
            <div class="mv-column-filter-date-range__custom">
                <div class="mv-column-filter-date-range__field">
                    <label>From</label>
                    <input v-model="customFrom" type="date" />
                </div>
                <span class="mv-column-filter-date-range__arrow">→</span>
                <div class="mv-column-filter-date-range__field">
                    <label>To</label>
                    <input v-model="customTo" type="date" />
                </div>
            </div>

            <div class="mv-column-filter-date-range__footer">
                <MvButton size="sm" variant="ghost" @click="onClear">Clear</MvButton>
                <MvButton size="sm" variant="primary" @click="onApplyCustom">Apply</MvButton>
            </div>
            <div v-if="currentRangeLabel" class="mv-column-filter-date-range__caption">{{ currentRangeLabel }}</div>
        </template>
        <button v-else-if="modelValue.preset" type="button" class="mv-column-filter-date-range__clear-all" @click="onClear">
            Clear
        </button>
    </div>
</template>

<style scoped>
.mv-column-filter-date-range {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 320px;
}

.mv-column-filter-date-range__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.mv-column-filter-date-range__title {
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary, #17212b);
}

.mv-column-filter-date-range__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: #98a2b3;
    cursor: pointer;
    padding: 0;
}

.mv-column-filter-date-range__close svg {
    width: 12px;
    height: 12px;
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

.mv-column-filter-date-range__custom {
    display: flex;
    align-items: flex-end;
    gap: 8px;
}

.mv-column-filter-date-range__field {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.mv-column-filter-date-range__field label {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}

.mv-column-filter-date-range__field input {
    width: 100%;
    min-width: 0;
    height: 38px;
    padding: 0 10px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light, #f8fafc);
    font-size: 13px;
    color: var(--el-text-color-primary, #17212b);
}

.mv-column-filter-date-range__arrow {
    padding-bottom: 10px;
    color: #98a2b3;
    font-size: 14px;
    flex-shrink: 0;
}

.mv-column-filter-date-range__footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

.mv-column-filter-date-range__footer :deep(.mv-button) {
    min-width: 72px;
}

.mv-column-filter-date-range__caption {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
    text-align: center;
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
