<script setup lang="ts">
// Masked DD.MM.YYYY input plus calendar grid; use this instead of <input type="date"> or a library.
import { computed, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue';

export interface DatePickerLabels {
    placeholder: string;
    invalidDate: string;
    previousMonth: string;
    nextMonth: string;
    clear: string;
    weekdays: string[];
}

const DEFAULT_LABELS: DatePickerLabels = {
    placeholder: 'DD.MM.YYYY',
    invalidDate: 'Not a real date',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    clear: 'Clear',
    weekdays: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
};

const props = withDefaults(
    defineProps<{
        modelValue: string;
        hideInput?: boolean;
        hideClear?: boolean;
        locale?: string;
        labels?: Partial<DatePickerLabels>;
    }>(),
    {
        hideInput: false,
        hideClear: false,
        locale: 'en-US',
        labels: () => ({}),
    },
);
const text = computed<DatePickerLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }));
// `pick` fires only on a calendar click, so callers can auto-advance without closing mid-typing.
const emit = defineEmits<{ 'update:modelValue': [value: string]; pick: [value: string] }>();

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
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}
function toDisplay(date: Date | null): string {
    if (!date) return '';
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

const selected = computed(() => parseIso(props.modelValue));
const today = new Date();
const viewMonth = ref(selected.value ?? new Date(today.getFullYear(), today.getMonth(), 1));

// Separate from modelValue so a half-typed date is not reformatted on every keystroke.
const textValue = ref(toDisplay(selected.value));
watch(
    () => props.modelValue,
    v => {
        textValue.value = toDisplay(parseIso(v));
    },
);

// Set only when all 8 digits are typed and do not form a real calendar date.
const invalid = ref(false);

function onTextInput(event: Event): void {
    const digits = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) textValue.value = digits;
    else if (digits.length <= 4) textValue.value = `${digits.slice(0, 2)}.${digits.slice(2)}`;
    else textValue.value = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;

    if (digits.length < 8) {
        invalid.value = false;
        return;
    }
    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4));
    const candidate = new Date(year, month - 1, day);
    // new Date() rolls overflow forward; comparing fields back detects it.
    if (
        candidate.getFullYear() !== year ||
        candidate.getMonth() !== month - 1 ||
        candidate.getDate() !== day
    ) {
        invalid.value = true;
        return;
    }
    invalid.value = false;
    viewMonth.value = new Date(year, month - 1, 1);
    emit('update:modelValue', toIso(candidate));
}

const monthLabel = computed(() =>
    viewMonth.value.toLocaleDateString(props.locale, { month: 'long', year: 'numeric' }),
);

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
        const date = new Date(
            gridStart.getFullYear(),
            gridStart.getMonth(),
            gridStart.getDate() + i,
        );
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
    const iso = toIso(day.date);
    emit('update:modelValue', iso);
    emit('pick', iso);
}
function clear(): void {
    emit('update:modelValue', '');
}
function selectAllOnFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
}
</script>

<template>
    <div class="mv-date-picker">
        <input
            v-if="!hideInput"
            class="mv-date-picker__input"
            :class="{ 'mv-date-picker__input--invalid': invalid }"
            type="text"
            inputmode="numeric"
            :placeholder="text.placeholder"
            :value="textValue"
            @input="onTextInput"
            @focus="selectAllOnFocus"
        />
        <p v-if="invalid" class="mv-date-picker__error">{{ text.invalidDate }}</p>
        <div class="mv-date-picker__header">
            <button
                type="button"
                class="mv-date-picker__nav"
                :aria-label="text.previousMonth"
                @click="prevMonth"
            >
                <ArrowLeft />
            </button>
            <span class="mv-date-picker__month">{{ monthLabel }}</span>
            <button
                type="button"
                class="mv-date-picker__nav"
                :aria-label="text.nextMonth"
                @click="nextMonth"
            >
                <ArrowRight />
            </button>
        </div>
        <div class="mv-date-picker__weekdays">
            <span v-for="wd in text.weekdays" :key="wd">{{ wd }}</span>
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
        <button
            v-if="modelValue && !hideClear"
            type="button"
            class="mv-date-picker__clear"
            @click="clear"
        >
            {{ text.clear }}
        </button>
    </div>
</template>

<style scoped>
.mv-date-picker {
    width: 260px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mv-date-picker__input {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light, #f8fafc);
    font-size: 13px;
    color: var(--el-text-color-primary, #17212b);
}

.mv-date-picker__input:focus {
    outline: none;
    border-color: var(--el-color-primary, #00b894);
}

.mv-date-picker__input--invalid {
    border-color: var(--el-color-danger, #dc2626);
    color: var(--el-color-danger, #dc2626);
}

.mv-date-picker__error {
    margin: -4px 0 0;
    font-size: 11px;
    color: var(--el-color-danger, #dc2626);
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
