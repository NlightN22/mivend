<script setup lang="ts">
import { useUiLabels } from '../../utils/uiLabels';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Calendar } from '@element-plus/icons-vue';
import MvDatePicker from '../MvDatePicker/MvDatePicker.vue';
import { useAnchoredPanel } from '../../composables/useAnchoredPanel';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';
import { isoToDisplay, maskDate, parseMaskedDate } from './dateFieldText';
const uiLabel = useUiLabels();

// One compact date input: a masked DD.MM.YYYY field with a small calendar popover, native picker on phones.
const props = withDefaults(defineProps<{ modelValue: string; placeholder?: string }>(), {
    placeholder: 'DD.MM.YYYY',
});
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const rootEl = ref<HTMLElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);
const open = ref(false);
const text = ref(isoToDisplay(props.modelValue));
const invalid = ref(false);
const native = useIsMobileViewport(640);
const { style } = useAnchoredPanel({
    open,
    anchor: () => rootEl.value,
    width: 282,
    sheet: ref(false),
});

watch(
    () => props.modelValue,
    v => {
        text.value = isoToDisplay(v);
    },
);

function onInput(event: Event): void {
    text.value = maskDate((event.target as HTMLInputElement).value);
    const iso = parseMaskedDate(text.value);
    invalid.value = !iso && text.value.length === 10;
    if (iso) emit('update:modelValue', iso);
    else if (!text.value) emit('update:modelValue', '');
}
function onPick(iso: string): void {
    emit('update:modelValue', iso);
    open.value = false;
}
function onDocClick(e: MouseEvent): void {
    const path = e.composedPath();
    if (path.includes(rootEl.value as EventTarget) || path.includes(popoverEl.value as EventTarget))
        return;
    open.value = false;
}
function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open.value) {
        open.value = false;
        e.stopImmediatePropagation();
    }
}
onMounted(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeydown, true);
});
onBeforeUnmount(() => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKeydown, true);
});
</script>

<template>
    <div ref="rootEl" class="mv-date-field">
        <input
            v-if="native"
            class="mv-date-field__input"
            type="date"
            :value="modelValue"
            @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
        <template v-else>
            <input
                class="mv-date-field__input"
                :class="{ 'mv-date-field__input--invalid': invalid }"
                type="text"
                inputmode="numeric"
                :placeholder="placeholder"
                :value="text"
                @input="onInput"
            />
            <button
                type="button"
                class="mv-date-field__toggle"
                :aria-label="uiLabel('openCalendar', 'Open calendar')"
                :aria-expanded="open"
                @click="open = !open"
            >
                <Calendar />
            </button>
            <Teleport to="body">
                <div
                    v-if="open"
                    ref="popoverEl"
                    class="mv-date-field__popover"
                    :style="style"
                    role="dialog"
                    data-testid="date-field-popover"
                    data-mv-nested
                >
                    <MvDatePicker hide-input hide-clear :model-value="modelValue" @pick="onPick" />
                </div>
            </Teleport>
        </template>
        <p v-if="invalid" class="mv-date-field__error">
            {{ uiLabel('notRealDate', 'Not a real date') }}
        </p>
    </div>
</template>

<style scoped>
.mv-date-field {
    position: relative;
    display: block;
    width: 100%;
}

.mv-date-field__input {
    box-sizing: border-box;
    width: 100%;
    height: 32px;
    padding: 0 34px 0 10px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light);
    font-size: 13px;
    color: var(--el-text-color-primary);
}

.mv-date-field__input:focus {
    outline: none;
    border-color: var(--el-color-primary);
}

.mv-date-field__input--invalid {
    border-color: var(--el-color-danger, var(--app-danger-btn-hover));
}

.mv-date-field__toggle {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--el-text-color-secondary);
    cursor: pointer;
}

.mv-date-field__toggle:hover {
    background: var(--app-slate-bg);
}

.mv-date-field__toggle svg {
    width: 14px;
    height: 14px;
}

.mv-date-field__error {
    margin: 2px 0 0;
    font-size: 11px;
    color: var(--el-color-danger, var(--app-danger-btn-hover));
}

.mv-date-field__popover {
    position: fixed;
    z-index: calc(var(--mv-z-popover) + 2);
    box-sizing: border-box;
    padding: 10px;
    background: var(--app-surface);
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    box-shadow: 0 10px 30px var(--app-ink-10);
}
</style>
