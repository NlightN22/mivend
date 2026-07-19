<script setup lang="ts">
// The one filter type that keeps Apply/Clear (see columnFilterTypes.ts) — the condition is
// composite (mode + one or two numbers), so instant-apply-per-keystroke would fire a half-entered
// query (e.g. applying "From" the moment it's typed, before "To" is even touched) and — for a
// real InputNumber — re-render the popover on every keystroke, which is exactly the focus-loss
// bug this component's ancestor (CustomerOrdersDataTable.vue's original Total filter) had. Renders
// directly as the already-open filter popover's content, like MvColumnFilterDate/Enum/Status.
import { computed, ref, watch } from 'vue';
import MvButton from '../MvButton/MvButton.vue';
import type { AmountRangeFilterConfig, AmountRangeFilterValue, AmountRangePreset } from './columnFilterTypes';

const props = defineProps<{ config: AmountRangeFilterConfig; modelValue: AmountRangeFilterValue }>();
const emit = defineEmits<{ 'update:modelValue': [value: AmountRangeFilterValue] }>();

const MODES: { value: AmountRangeFilterValue['mode']; label: string }[] = [
    { value: 'range', label: 'Range' },
    { value: 'equal', label: 'Equal' },
    { value: 'more', label: 'More than' },
    { value: 'less', label: 'Less than' },
];

const currencySymbol = computed(() => {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: props.config.currencyCode }).formatToParts(0);
    return parts.find(p => p.type === 'currency')?.value ?? props.config.currencyCode;
});

const DEFAULT_PRESETS: AmountRangePreset[] = [
    { label: 'Up to 500', min: undefined, max: 500 },
    { label: '500–1,000', min: 500, max: 1000 },
    { label: '1,000–5,000', min: 1000, max: 5000 },
    { label: 'Over 5,000', min: 5000, max: undefined },
];
const presets = computed(() => {
    const list = props.config.presets ?? DEFAULT_PRESETS;
    const s = currencySymbol.value;
    return list.map(p => ({
        ...p,
        // A function replacer, not a `$1`-style replacement string — `${s}$1` (s === '$') builds
        // the literal string "$$1", and String.replace treats "$$" as an escaped literal "$"
        // followed by plain "1", not the "$" + backreference this looked like — every match
        // silently became the literal text "$1" instead of the real number (real bug: every
        // preset read "Up to $1", "$1–$1", etc. regardless of its actual thresholds).
        label: p.label.replace(/(\d[\d,]*)/g, match => `${s}${match}`),
    }));
});

// Local staged state — only written back via emit on Apply/Clear (see doc comment above).
const mode = ref(props.modelValue.mode);
const minLocal = ref(props.modelValue.min);
const maxLocal = ref(props.modelValue.max);
const singleLocal = ref<number | undefined>(mode.value === 'range' ? undefined : (props.modelValue.min ?? props.modelValue.max));
watch(
    () => props.modelValue,
    v => {
        mode.value = v.mode;
        minLocal.value = v.min;
        maxLocal.value = v.max;
        singleLocal.value = v.mode === 'range' ? undefined : (v.min ?? v.max);
    },
);

function isPresetActive(preset: AmountRangePreset): boolean {
    return mode.value === 'range' && minLocal.value === preset.min && maxLocal.value === preset.max;
}
function applyPreset(preset: AmountRangePreset): void {
    mode.value = 'range';
    minLocal.value = preset.min;
    maxLocal.value = preset.max;
}

function onApply(): void {
    let min: number | undefined;
    let max: number | undefined;
    switch (mode.value) {
        case 'range':
            min = minLocal.value;
            max = maxLocal.value;
            break;
        case 'equal':
            min = singleLocal.value;
            max = singleLocal.value;
            break;
        case 'more':
            min = singleLocal.value;
            break;
        case 'less':
            max = singleLocal.value;
            break;
    }
    emit('update:modelValue', { mode: mode.value, min, max });
}
function onClear(): void {
    mode.value = 'range';
    minLocal.value = undefined;
    maxLocal.value = undefined;
    singleLocal.value = undefined;
    emit('update:modelValue', { mode: 'range', min: undefined, max: undefined });
}
</script>

<template>
    <div class="mv-amount-range-filter">
        <div class="mv-amount-range-filter__title">Total amount</div>

        <div class="mv-amount-range-filter__modes">
            <button
                v-for="m in MODES"
                :key="m.value"
                type="button"
                class="mv-amount-range-filter__mode-btn"
                :class="{ 'mv-amount-range-filter__mode-btn--active': mode === m.value }"
                @click="mode = m.value"
            >
                {{ m.label }}
            </button>
        </div>

        <div v-if="mode === 'range'" class="mv-amount-range-filter__row">
            <div class="mv-amount-range-filter__field">
                <label>From</label>
                <div class="mv-amount-range-filter__input">
                    <span>{{ currencySymbol }}</span>
                    <input v-model.number="minLocal" type="number" placeholder="0" />
                </div>
            </div>
            <div class="mv-amount-range-filter__field">
                <label>To</label>
                <div class="mv-amount-range-filter__input">
                    <span>{{ currencySymbol }}</span>
                    <input v-model.number="maxLocal" type="number" placeholder="0" />
                </div>
            </div>
        </div>
        <div v-else class="mv-amount-range-filter__field">
            <label>Value</label>
            <div class="mv-amount-range-filter__input">
                <span>{{ currencySymbol }}</span>
                <input v-model.number="singleLocal" type="number" placeholder="0" />
            </div>
        </div>

        <div v-if="mode === 'range'" class="mv-amount-range-filter__presets">
            <button
                v-for="preset in presets"
                :key="preset.label"
                type="button"
                class="mv-amount-range-filter__preset"
                :class="{ 'mv-amount-range-filter__preset--active': isPresetActive(preset) }"
                @click="applyPreset(preset)"
            >
                {{ preset.label }}
            </button>
        </div>
        <p v-if="mode === 'range'" class="mv-amount-range-filter__hint">Leave one side empty for an open range</p>

        <div class="mv-amount-range-filter__footer">
            <MvButton size="sm" variant="ghost" @click="onClear">Clear</MvButton>
            <MvButton size="sm" variant="primary" @click="onApply">Apply</MvButton>
        </div>
    </div>
</template>

<style scoped>
.mv-amount-range-filter {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 260px;
}

.mv-amount-range-filter__title {
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary, #17212b);
}

.mv-amount-range-filter__modes {
    display: flex;
    gap: 4px;
    background: #f2f4f7;
    border-radius: 8px;
    padding: 3px;
}

.mv-amount-range-filter__mode-btn {
    flex: 1;
    border: none;
    background: transparent;
    border-radius: 6px;
    padding: 5px 6px;
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
}

.mv-amount-range-filter__mode-btn--active {
    background: white;
    color: var(--el-color-primary, #00b894);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
}

.mv-amount-range-filter__row {
    display: flex;
    gap: 8px;
}

.mv-amount-range-filter__field {
    flex: 1;
    /* Without this, a flex item's default min-width is its content's min-content size — a
       type="number" input's native intrinsic width can exceed the space two side-by-side
       fields actually have, so "From"/"To" overflowed past the popover's right edge instead of
       shrinking to fit (real bug, confirmed live: the "To" field's box visibly extended outside
       the white popover background). */
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mv-amount-range-filter__field label {
    font-size: 11px;
    color: var(--el-text-color-secondary, #6b7280);
}

.mv-amount-range-filter__input {
    display: flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light, #f8fafc);
    padding: 0 10px;
}

.mv-amount-range-filter__input span {
    font-size: 13px;
    color: #98a2b3;
}

.mv-amount-range-filter__input input {
    flex: 1;
    min-width: 0;
    height: 34px;
    border: none;
    background: transparent;
    outline: none;
    font-size: 13px;
    color: var(--el-text-color-primary, #17212b);
}

.mv-amount-range-filter__presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.mv-amount-range-filter__preset {
    border: 1px solid #e4e7ec;
    background: white;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
}

.mv-amount-range-filter__preset--active {
    border-color: var(--el-color-primary, #00b894);
    color: var(--el-color-primary, #00b894);
}

.mv-amount-range-filter__hint {
    font-size: 11px;
    color: var(--el-text-color-secondary, #6b7280);
    margin: 0;
}

.mv-amount-range-filter__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
    border-top: 1px solid #e4e7ec;
}
</style>
