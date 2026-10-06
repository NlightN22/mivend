<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IconCheck } from '@tabler/icons-vue';

interface Props {
    modelValue: number;
    min?: number;
    step?: number;
    disabled?: boolean;
    size?: 'md' | 'sm';
    editable?: boolean;
    block?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    min: 1,
    step: 1,
    disabled: false,
    size: 'md',
    editable: false,
    block: false,
});

const emit = defineEmits<{ 'update:modelValue': [n: number] }>();

const draft = ref(String(props.modelValue));
const parsedDraft = computed(() => (/^\d+$/.test(draft.value) ? Number(draft.value) : null));
const dirty = computed(() => draft.value !== String(props.modelValue));
const canConfirm = computed(
    () => parsedDraft.value !== null && parsedDraft.value >= props.min && dirty.value,
);

watch(
    () => props.modelValue,
    v => {
        draft.value = String(v);
    },
);

function confirm() {
    if (canConfirm.value) emit('update:modelValue', parsedDraft.value as number);
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
            class="mv-qty-stepper__btn"
            type="button"
            :disabled="disabled || modelValue <= min"
            @click="dec"
        >
            −
        </button>
        <input
            v-if="editable"
            v-model="draft"
            class="mv-qty-stepper__val mv-qty-stepper__input"
            inputmode="numeric"
            :disabled="disabled"
            @keydown.enter.prevent="confirm"
            @keydown.esc.prevent="revert"
        />
        <span v-else class="mv-qty-stepper__val">{{ modelValue }}</span>
        <button class="mv-qty-stepper__btn" type="button" :disabled="disabled" @click="inc">
            +
        </button>
        <button
            v-if="editable && dirty"
            class="mv-qty-stepper__btn mv-qty-stepper__confirm"
            type="button"
            :disabled="!canConfirm"
            @click="confirm"
        >
            <IconCheck :size="18" />
        </button>
    </div>
</template>

<style scoped>
.mv-qty-stepper {
    display: inline-flex;
    align-items: center;
    border: 1.5px solid #dde7e2;
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
    width: 44px;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    user-select: text;
}
.mv-qty-stepper__confirm {
    width: 34px;
    background: #e2f8ef;
    color: #008a64;
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
    color: #2c3b36;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.1s;
}

.mv-qty-stepper__btn:hover:not(:disabled) {
    background: #f4faf7;
}
.mv-qty-stepper__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.mv-qty-stepper__input {
    width: 44px;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    user-select: text;
}
.mv-qty-stepper__confirm {
    width: 34px;
    background: #e2f8ef;
    color: #008a64;
}

.mv-qty-stepper__val {
    min-width: 36px;
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    color: #14231f;
    user-select: none;
}
</style>
