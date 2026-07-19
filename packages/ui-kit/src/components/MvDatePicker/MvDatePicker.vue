<script setup lang="ts">
// Standalone single-date calendar popover — native Date arithmetic, no date library dependency
// (matches MvSelect's "stay light" convention). The only date-picking UI in ui-kit; reused by
// MvColumnFilterDate for the `single-date` column-filter type, but exported standalone since any
// future feature needing a plain date picker should use this rather than reaching for a new
// library or a page-local implementation.
import { computed, ref } from 'vue';
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseIso(value: string): Date | null {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}
function toIso(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const selected = computed(() => parseIso(props.modelValue));
const today = new Date();
const viewMonth = ref(selected.value ?? new Date(today.getFullYear(), today.getMonth(), 1));

const monthLabel = computed(() => viewMonth.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

interface DayCell {
    date: Date;
    inCurrentMonth: boolean;
}
const days = computed<DayCell[]>(() => {
    const year = viewMonth.value.getFullYear();
    const month = viewMonth.value.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
        const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        return { date, inCurrentMonth: date.getMonth() === month };
    });
});

function prevMonth(): void {
    viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() - 1, 1);
}
function nextMonth(): void {
    viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + 1, 1);
}
function pick(day: DayCell): void {
    emit('update:modelValue', toIso(day.date));
}
function clear(): void {
    emit('update:modelValue', '');
}
</script>

<template>
    <div class="mv-date-picker">
        <div class="mv-date-picker__header">
            <button type="button" class="mv-date-picker__nav" aria-label="Previous month" @click="prevMonth">
                <ArrowLeft />
            </button>
            <span class="mv-date-picker__month">{{ monthLabel }}</span>
            <button type="button" class="mv-date-picker__nav" aria-label="Next month" @click="nextMonth">
                <ArrowRight />
            </button>
        </div>
        <div class="mv-date-picker__weekdays">
            <span v-for="wd in WEEKDAYS" :key="wd">{{ wd }}</span>
        </div>
        <div class="mv-date-picker__grid">
            <button
                v-for="(day, i) in days"
                :key="i"
                type="button"
                class="mv-date-picker__day"
                :class="{
                    'mv-date-picker__day--muted': !day.inCurrentMonth,
                    'mv-date-picker__day--today': isSameDay(day.date, today),
                    'mv-date-picker__day--selected': selected && isSameDay(day.date, selected),
                }"
                @click="pick(day)"
            >
                {{ day.date.getDate() }}
            </button>
        </div>
        <button v-if="modelValue" type="button" class="mv-date-picker__clear" @click="clear">Clear</button>
    </div>
</template>

<style scoped>
.mv-date-picker {
    width: 260px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mv-date-picker__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.mv-date-picker__month {
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary, #17212b);
}

.mv-date-picker__nav {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
}

.mv-date-picker__nav:hover {
    background: #f8fafc;
}

.mv-date-picker__nav svg {
    width: 12px;
    height: 12px;
}

.mv-date-picker__weekdays,
.mv-date-picker__grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
}

.mv-date-picker__weekdays span {
    text-align: center;
    font-size: 11px;
    color: #98a2b3;
    padding: 2px 0;
}

.mv-date-picker__day {
    height: 30px;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-size: 12px;
    color: var(--el-text-color-primary, #17212b);
    cursor: pointer;
}

.mv-date-picker__day:hover {
    background: #f8fafc;
}

.mv-date-picker__day--muted {
    color: #d0d5dd;
}

.mv-date-picker__day--today {
    font-weight: 700;
    color: var(--el-color-primary, #00b894);
}

.mv-date-picker__day--selected {
    background: var(--el-color-primary, #00b894);
    color: white;
    font-weight: 700;
}

.mv-date-picker__clear {
    align-self: center;
    border: none;
    background: transparent;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
    cursor: pointer;
    padding: 4px;
}
</style>
