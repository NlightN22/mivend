<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useUiLabels } from '../../utils/uiLabels';
import { useUiLocale } from '../../utils/uiLocale';
import { datePeriodError } from '../../utils/fieldValidation';
import MvButton from '../MvButton/MvButton.vue';
import MvDateRangeField from '../MvDateRangeField/MvDateRangeField.vue';
import { DATE_RANGE_PRESETS, resolveDateRangePreset } from './dateRangePresets';
import type { DateRangeFilterConfig, DateRangeFilterValue } from './columnFilterTypes';
const uiLabel = useUiLabels();

// Presets apply the moment they are picked; only "Custom range" needs an explicit Apply/Clear.
const props = defineProps<{ config: DateRangeFilterConfig; modelValue: DateRangeFilterValue }>();
const locale = useUiLocale();
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
const canApply = computed(() => !datePeriodError(customFrom.value, customTo.value));

function formatDisplayDate(iso: string): string {
    if (!iso) return '';
    return new Date(`${iso}T00:00:00`).toLocaleDateString(locale.value, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}
const currentRangeLabel = computed(() => {
    if (!customFrom.value && !customTo.value) return '';
    if (customFrom.value && customTo.value)
        return `${formatDisplayDate(customFrom.value)} – ${formatDisplayDate(customTo.value)}`;
    return formatDisplayDate(customFrom.value || customTo.value);
});

function onPresetChange(): void {
    if (selectedPreset.value === 'custom') return;
    const { from, to } = resolveDateRangePreset(selectedPreset.value);
    emit('update:modelValue', { preset: selectedPreset.value, from, to });
}
function onApplyCustom(): void {
    if (!canApply.value) return;
    emit('update:modelValue', { preset: 'custom', from: customFrom.value, to: customTo.value });
    emit('close');
}
function onClear(): void {
    selectedPreset.value = presets.value[0]?.key ?? '';
    customFrom.value = '';
    customTo.value = '';
    emit('update:modelValue', { preset: '', from: '', to: '' });
    emit('close');
}
</script>

<template>
    <div class="mv-column-filter-date-range">
        <select
            v-model="selectedPreset"
            class="mv-column-filter-date-range__select"
            @change="onPresetChange"
        >
            <option v-for="preset in presets" :key="preset.key" :value="preset.key">
                {{ preset.label }}
            </option>
        </select>

        <template v-if="isCustom">
            <MvDateRangeField v-model:from="customFrom" v-model:to="customTo" />
            <div class="mv-column-filter-date-range__footer">
                <MvButton size="sm" variant="ghost" @click="onClear">{{
                    uiLabel('clear', 'Clear')
                }}</MvButton>
                <MvButton
                    size="sm"
                    variant="primary"
                    :disabled="!canApply"
                    @click="onApplyCustom"
                    >{{ uiLabel('apply', 'Apply') }}</MvButton
                >
            </div>
            <div v-if="currentRangeLabel" class="mv-column-filter-date-range__caption">
                {{ currentRangeLabel }}
            </div>
        </template>
        <button
            v-else-if="modelValue.preset"
            type="button"
            class="mv-column-filter-date-range__clear-all"
            @click="onClear"
        >
            {{ uiLabel('clear', 'Clear') }}
        </button>
    </div>
</template>

<style scoped>
.mv-column-filter-date-range {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 260px;
}

.mv-column-filter-date-range__select {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light);
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
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
    color: var(--el-text-color-secondary);
    text-align: center;
}

.mv-column-filter-date-range__clear-all {
    align-self: flex-start;
    border: none;
    background: transparent;
    color: var(--el-color-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
}
</style>
