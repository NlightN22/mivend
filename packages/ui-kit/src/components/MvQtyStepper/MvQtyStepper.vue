<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IconCheck, IconX } from '@tabler/icons-vue';
import { decreaseDisabled, parseQuantity } from './qtyStepperModel';

export interface QtyStepperLabels {
    cancel: string;
    decrease: string;
    quantity: string;
    confirm: string;
    increase: string;
    wholeNumber?: string;
    atLeast?: string;
    atMost?: string;
    multipleOf?: string;
}

const DEFAULT_LABELS: Required<QtyStepperLabels> = {
    cancel: 'Cancel',
    decrease: 'Decrease',
    quantity: 'Quantity',
    confirm: 'Confirm',
    increase: 'Increase',
    wholeNumber: 'Enter a whole number',
    atLeast: 'At least {n}',
    atMost: 'At most {n}',
    multipleOf: 'A multiple of {n}',
};

interface Props {
    modelValue: number;
    min?: number;
    step?: number;
    disabled?: boolean;
    size?: 'md' | 'sm';
    editable?: boolean;
    // 'live': a typed valid value is emitted at once and there are no inner confirm/cancel buttons.
    commit?: 'confirm' | 'live';
    max?: number;
    block?: boolean;
    labels?: Partial<QtyStepperLabels>;
}

const props = withDefaults(defineProps<Props>(), {
    min: 1,
    step: 1,
    disabled: false,
    size: 'md',
    editable: false,
    commit: 'confirm',
    block: false,
    labels: () => ({}),
});

const text = computed<Required<QtyStepperLabels>>(() => ({ ...DEFAULT_LABELS, ...props.labels }));

const emit = defineEmits<{ 'update:modelValue': [n: number] }>();

const draft = ref(String(props.modelValue));
const focused = ref(false);
const staleWhileFocused = ref(false);
const parsedDraft = computed(() => (/^\d+$/.test(draft.value) ? Number(draft.value) : null));
const dirty = computed(() => draft.value !== String(props.modelValue));
const live = computed(() => props.commit === 'live');
const typed = computed(() => props.editable || live.value);
const editing = computed(() => props.editable && !live.value && dirty.value);
const problem = computed(() => {
    if (!live.value || !dirty.value) return null;
    const { error } = parseQuantity(draft.value, {
        min: props.min,
        max: props.max,
        step: props.step,
    });
    if (error === null) return null;
    const t = text.value;
    if (error === 'whole') return t.wholeNumber;
    if (error === 'min') return t.atLeast.replace('{n}', String(props.min));
    if (error === 'max') return t.atMost.replace('{n}', String(props.max));
    return t.multipleOf.replace('{n}', String(props.step));
});
const decDisabled = computed(() =>
    decreaseDisabled(props.modelValue, { min: props.min, step: props.step }, live.value),
);
const canConfirm = computed(
    () =>
        parsedDraft.value !== null &&
        parsedDraft.value >= props.min &&
        parsedDraft.value % props.step === 0 &&
        dirty.value,
);

watch(
    () => props.modelValue,
    v => {
        if (live.value && String(v) !== draft.value && parsedDraft.value === v) return;
        if (focused.value && !live.value) staleWhileFocused.value = true;
        else draft.value = String(v);
    },
);

function onInput() {
    if (!live.value) return;
    const { value } = parseQuantity(draft.value, {
        min: props.min,
        max: props.max,
        step: props.step,
    });
    if (value !== null && value !== props.modelValue) emit('update:modelValue', value);
}

function confirm() {
    if (canConfirm.value) emit('update:modelValue', parsedDraft.value as number);
}

function onBlur() {
    focused.value = false;
    if (live.value && problem.value) draft.value = String(props.modelValue);
    if (!staleWhileFocused.value) return;
    staleWhileFocused.value = false;
    draft.value = String(props.modelValue);
}

function revert() {
    draft.value = String(props.modelValue);
}

function dec() {
    const next = props.modelValue - props.step;
    if (next >= props.min) emit('update:modelValue', next);
}

function inc() {
    emit('update:modelValue', props.modelValue + props.step);
}
</script>

<template>
    <div
        class="mv-qty-stepper"
        :class="{
            'mv-qty-stepper--disabled': disabled,
            'mv-qty-stepper--sm': size === 'sm',
            'mv-qty-stepper--block': block,
        }"
    >
        <button
            v-if="editing"
            class="mv-qty-stepper__btn"
            type="button"
            :aria-label="text.cancel"
            @click="revert"
        >
            <IconX :size="16" />
        </button>
        <button
            v-else
            class="mv-qty-stepper__btn"
            type="button"
            :aria-label="text.decrease"
            :disabled="disabled || decDisabled"
            @click="dec"
        >
            −
        </button>
        <input
            v-if="typed"
            v-model="draft"
            class="mv-qty-stepper__val mv-qty-stepper__input"
            :class="{ 'mv-qty-stepper__input--invalid': problem }"
            inputmode="numeric"
            :title="problem ?? undefined"
            :aria-invalid="problem ? 'true' : undefined"
            :aria-label="text.quantity"
            :disabled="disabled"
            @focus="
                focused = true;
                ($event.target as HTMLInputElement).select();
            "
            @input="onInput"
            @blur="onBlur"
            @keydown.enter.prevent="confirm"
            @keydown.esc.prevent="revert"
        />
        <span v-else class="mv-qty-stepper__val">{{ modelValue }}</span>
        <button
            v-if="editing"
            class="mv-qty-stepper__btn mv-qty-stepper__confirm"
            type="button"
            :aria-label="text.confirm"
            :disabled="!canConfirm"
            @click="confirm"
        >
            <IconCheck :size="18" />
        </button>
        <button
            v-else
            class="mv-qty-stepper__btn"
            type="button"
            :aria-label="text.increase"
            :disabled="disabled"
            @click="inc"
        >
            +
        </button>
    </div>
</template>

<style scoped>
.mv-qty-stepper {
    display: inline-flex;
    align-items: center;
    border: 1.5px solid var(--app-nav-border-strong);
    border-radius: 12px;
    overflow: hidden;
    height: 44px;
}

.mv-qty-stepper--block {
    display: flex;
    width: 100%;
}
.mv-qty-stepper--block .mv-qty-stepper__val {
    flex: 1;
    text-align: center;
}

.mv-qty-stepper--disabled {
    opacity: 0.45;
    pointer-events: none;
}

.mv-qty-stepper--sm {
    height: 32px;
}
.mv-qty-stepper--sm .mv-qty-stepper__btn {
    width: 28px;
    font-size: 16px;
}
.mv-qty-stepper--sm .mv-qty-stepper__input {
    width: 40px;
    height: 24px;
}
.mv-qty-stepper__confirm {
    width: 34px;
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
}

.mv-qty-stepper__val {
    min-width: 26px;
    font-size: 13px;
}

.mv-qty-stepper__btn {
    width: 38px;
    height: 100%;
    border: none;
    background: transparent;
    font-size: 20px;
    color: var(--app-text-body2);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.1s;
}

.mv-qty-stepper__btn:hover:not(:disabled) {
    background: var(--app-row-hover);
}
.mv-qty-stepper__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.mv-qty-stepper__input {
    width: 52px;
    height: 30px;
    min-width: 0;
    margin: 0 2px;
    border: none;
    border-radius: 8px;
    outline: none;
    background: var(--app-slate-bg);
    font-family: inherit;
    user-select: text;
    transition: background 0.1s;
}
.mv-qty-stepper__input:hover {
    background: var(--app-nav-border);
}
.mv-qty-stepper__input--invalid {
    outline: 1.5px solid var(--app-danger-btn);
}
.mv-qty-stepper__input:focus {
    background: var(--app-nav-active-bg);
}
.mv-qty-stepper__confirm {
    width: 34px;
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
}

.mv-qty-stepper__val {
    min-width: 36px;
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    color: var(--app-nav-text-strong);
    user-select: none;
}
</style>
