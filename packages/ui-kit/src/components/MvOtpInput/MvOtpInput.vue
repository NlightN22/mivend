<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CODE_LENGTH, normalizeCode } from '../../composables/twoFactor/twoFactorTypes';

defineOptions({ inheritAttrs: false });
const props = defineProps<{ modelValue: string; error?: boolean; autofocus?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const input = ref<HTMLInputElement | null>(null);
const focused = ref(false);
const caret = ref(0);

const cells = computed(() =>
    Array.from({ length: CODE_LENGTH }, (_, i) => props.modelValue.charAt(i)),
);
const activeCell = computed(() => (focused.value ? Math.min(caret.value, CODE_LENGTH - 1) : -1));

function syncCaret(): void {
    caret.value = input.value?.selectionStart ?? props.modelValue.length;
}

function update(event: Event): void {
    const el = event.target as HTMLInputElement;
    const value = normalizeCode(el.value);
    if (el.value !== value) el.value = value;
    emit('update:modelValue', value);
    syncCaret();
}

onMounted(() => {
    if (props.autofocus) input.value?.focus();
});
</script>

<template>
    <div class="mv-otp" :class="{ 'mv-otp--error': error }">
        <div class="mv-otp__cells" aria-hidden="true">
            <span
                v-for="(digit, i) in cells"
                :key="i"
                class="mv-otp__cell"
                :class="{ 'mv-otp__cell--active': i === activeCell }"
            >
                {{ digit }}
                <i v-if="i === activeCell && !digit" class="mv-otp__caret" />
            </span>
        </div>
        <input
            v-bind="$attrs"
            ref="input"
            class="mv-otp__input"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            :maxlength="CODE_LENGTH"
            :value="modelValue"
            @input="update"
            @focus="focused = true"
            @blur="focused = false"
            @keyup="syncCaret"
            @click="syncCaret"
            @select="syncCaret"
        />
    </div>
</template>

<style scoped>
.mv-otp {
    position: relative;
}
.mv-otp__cells {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
}
.mv-otp__cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    border: 1px solid var(--el-border-color);
    border-radius: 14px;
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    font-size: 24px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    transition:
        border-color 0.15s,
        box-shadow 0.15s;
}
.mv-otp__cell--active {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 4px var(--app-green-glow);
}
.mv-otp--error .mv-otp__cell {
    border-color: var(--app-danger-btn);
}
.mv-otp--error .mv-otp__cell--active {
    box-shadow: 0 0 0 4px var(--app-danger-glow);
}
.mv-otp__caret {
    width: 2px;
    height: 26px;
    background: var(--el-text-color-primary);
    animation: mv-otp-blink 1s steps(1) infinite;
}
.mv-otp__input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: transparent;
    caret-color: transparent;
    font-size: 16px;
    outline: none;
    opacity: 0.01;
    cursor: text;
}
.mv-otp__input::selection {
    background: transparent;
}
@keyframes mv-otp-blink {
    50% {
        opacity: 0;
    }
}
@media (prefers-reduced-motion: reduce) {
    .mv-otp__caret {
        animation: none;
    }
}
</style>
