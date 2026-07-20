<script setup lang="ts">
// Presets apply instantly the moment they're picked from the dropdown; only "Custom range"
// reveals From/To fields needing an explicit Apply/Clear (a manually-typed pair of dates is a
// composite condition, same reasoning as amount-range).
import { computed, ref, watch } from 'vue';
import MvButton from '../MvButton/MvButton.vue';
import MvDatePicker from '../MvDatePicker/MvDatePicker.vue';
import { DATE_RANGE_PRESETS, resolveDateRangePreset } from './dateRangePresets';
import type { DateRangeFilterConfig, DateRangeFilterValue } from './columnFilterTypes';

const props = defineProps<{ config: DateRangeFilterConfig; modelValue: DateRangeFilterValue }>();
const emit = defineEmits<{ 'update:modelValue': [value: DateRangeFilterValue]; close: [] }>();

const presets = computed(() => props.config.presets ?? DATE_RANGE_PRESETS);

const selectedPreset = ref(props.modelValue.preset || presets.value[0]?.key || '');
const customFrom = ref(props.modelValue.from);
const customTo = ref(props.modelValue.to);
// Which of the two calendars (if any) is open — only one at a time, same "no nested trigger
// clutter" idea as MvColumnFilterDate, just needing a toggle since there are two dates here.
const activeField = ref<'from' | 'to' | null>(null);
watch(
    () => props.modelValue,
    v => {
        selectedPreset.value = v.preset || presets.value[0]?.key || '';
        customFrom.value = v.from;
        customTo.value = v.to;
    },
);

const isCustom = computed(() => selectedPreset.value === 'custom');

// Same DD.MM.YYYY masking as MvDatePicker's own input (duplicated, not shared, since this
// component renders its own always-visible From/To text fields directly — MvDatePicker is used
// here calendar-grid-only, via its `hide-input` prop — see the real incident this whole file's
// comments document: the old design hid these fields behind a "Select date" button, and typing a
// date used to auto-close the calendar the instant it completed, with no way to fix a typo).
function toDisplayText(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
}
function maskDigits(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}
function tryParseComplete(masked: string): string | null {
    const digits = masked.replace(/\D/g, '');
    if (digits.length !== 8) return null;
    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4));
    const candidate = new Date(year, month - 1, day);
    if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const fromText = ref(toDisplayText(customFrom.value));
const toText = ref(toDisplayText(customTo.value));
watch(customFrom, v => (fromText.value = toDisplayText(v)));
watch(customTo, v => (toText.value = toDisplayText(v)));
function onFromInput(event: Event): void {
    fromText.value = maskDigits((event.target as HTMLInputElement).value);
    const iso = tryParseComplete(fromText.value);
    if (iso) customFrom.value = iso;
}
function onToInput(event: Event): void {
    toText.value = maskDigits((event.target as HTMLInputElement).value);
    const iso = tryParseComplete(toText.value);
    if (iso) customTo.value = iso;
}
// Selects the whole value on focus (matches native `<input type="date">`'s own affordance) so
// coming back to an already-filled field is a single Delete + retype, not a manual select-all
// first — real feedback: without this, editing a previously-picked date meant either carefully
// backspacing character-by-character or manually dragging to select first.
function selectAllOnFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
}

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
    activeField.value = null;
    if (selectedPreset.value === 'custom') return; // wait for the user to actually fill in From/To
    const { from, to } = resolveDateRangePreset(selectedPreset.value);
    emit('update:modelValue', { preset: selectedPreset.value, from, to });
}
// Only an explicit calendar-day click (MvDatePicker's `pick` event, not typing — see
// onFromInput/onToInput above) auto-advances/collapses — picking "From" advances to "To"
// (the natural next step in filling a range), picking "To" closes both calendars so the user
// lands straight on Apply/Clear.
function pickFrom(value: string): void {
    customFrom.value = value;
    activeField.value = 'to';
}
function pickTo(value: string): void {
    customTo.value = value;
    activeField.value = null;
}
function onApplyCustom(): void {
    emit('update:modelValue', { preset: 'custom', from: customFrom.value, to: customTo.value });
}
function onClear(): void {
    selectedPreset.value = presets.value[0]?.key ?? '';
    customFrom.value = '';
    customTo.value = '';
    fromText.value = '';
    toText.value = '';
    activeField.value = null;
    emit('update:modelValue', { preset: '', from: '', to: '' });
}
</script>

<template>
    <div class="mv-column-filter-date-range">
        <select v-model="selectedPreset" class="mv-column-filter-date-range__select" @change="onPresetChange">
            <option v-for="preset in presets" :key="preset.key" :value="preset.key">{{ preset.label }}</option>
        </select>

        <template v-if="isCustom">
            <div class="mv-column-filter-date-range__custom">
                <div class="mv-column-filter-date-range__field">
                    <label>From</label>
                    <input
                        type="text"
                        inputmode="numeric"
                        placeholder="DD.MM.YYYY"
                        class="mv-column-filter-date-range__date-input"
                        :class="{ 'mv-column-filter-date-range__date-input--active': activeField === 'from' }"
                        :value="fromText"
                        @input="onFromInput"
                        @focus="(e) => { activeField = 'from'; selectAllOnFocus(e); }"
                    />
                </div>
                <span class="mv-column-filter-date-range__arrow">→</span>
                <div class="mv-column-filter-date-range__field">
                    <label>To</label>
                    <input
                        type="text"
                        inputmode="numeric"
                        placeholder="DD.MM.YYYY"
                        class="mv-column-filter-date-range__date-input"
                        :class="{ 'mv-column-filter-date-range__date-input--active': activeField === 'to' }"
                        :value="toText"
                        @input="onToInput"
                        @focus="(e) => { activeField = 'to'; selectAllOnFocus(e); }"
                    />
                </div>
            </div>

            <!-- hide-clear: the footer's own Clear (below) already clears both From and To — the
                 calendar's own per-field Clear button was a second, redundant clear affordance
                 visible at the same time (real feedback: "Clear" appeared twice). -->
            <MvDatePicker v-if="activeField === 'from'" hide-input hide-clear :model-value="customFrom" @pick="pickFrom" />
            <MvDatePicker v-if="activeField === 'to'" hide-input hide-clear :model-value="customTo" @pick="pickTo" />

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
    width: 260px;
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
    font-size: 11px;
    color: var(--el-text-color-secondary, #6b7280);
}

.mv-column-filter-date-range__date-input {
    width: 100%;
    min-width: 0;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light, #f8fafc);
    font-size: 13px;
    color: var(--el-text-color-primary, #17212b);
}

.mv-column-filter-date-range__date-input:focus {
    outline: none;
}

.mv-column-filter-date-range__date-input--active {
    border-color: var(--el-color-primary, #00b894);
    color: var(--el-color-primary, #00b894);
    font-weight: 600;
}

.mv-column-filter-date-range__arrow {
    padding-bottom: 8px;
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
