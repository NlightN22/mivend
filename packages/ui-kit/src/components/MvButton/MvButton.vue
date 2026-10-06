<script setup lang="ts">
export type ButtonVariant = 'primary' | 'secondary' | 'catalog' | 'buy' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    nativeType?: 'button' | 'submit' | 'reset';
    // When set, renders as a real <a> instead of <button> — required for actions
    // like file downloads, where a script-triggered window.open() can be treated
    // as in-place navigation by the browser instead of opening a new tab/download.
    href?: string;
    target?: string;
    download?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    variant: 'primary',
    size: 'md',
    disabled: false,
    loading: false,
    nativeType: 'button',
});

const emit = defineEmits<{
    click: [event: MouseEvent];
}>();

function handleClick(event: MouseEvent): void {
    if (!props.disabled && !props.loading) {
        emit('click', event);
    }
}
</script>

<template>
    <a
        v-if="href"
        :class="[
            'mv-button',
            `mv-button--${variant}`,
            `mv-button--${size}`,
            { 'mv-button--disabled': disabled },
        ]"
        :href="href"
        :target="target"
        :rel="target === '_blank' ? 'noopener' : undefined"
        :download="download ? '' : undefined"
        @click="handleClick"
    >
        <slot />
    </a>
    <button
        v-else
        :class="[
            'mv-button',
            `mv-button--${variant}`,
            `mv-button--${size}`,
            { 'mv-button--disabled': disabled, 'mv-button--loading': loading },
        ]"
        :type="nativeType"
        :disabled="disabled || loading"
        @click="handleClick"
    >
        <span v-if="loading" class="mv-button__spinner" aria-hidden="true" />
        <slot />
    </button>
</template>

<style scoped>
.mv-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: none;
    cursor: pointer;
    text-decoration: none;
    box-sizing: border-box;
    font-family: var(--app-font-family, Inter, system-ui, sans-serif);
    font-size: var(--app-font-size-button, 14px);
    font-weight: 700;
    border-radius: var(--app-radius-md, 12px);
    transition:
        background 0.15s ease,
        box-shadow 0.15s ease,
        opacity 0.15s ease;
    white-space: nowrap;
    line-height: 1;
}

.mv-button--sm {
    height: 32px;
    padding: 0 12px;
    font-size: 13px;
    border-radius: var(--app-radius-sm, 8px);
}
.mv-button--md {
    height: 40px;
    padding: 0 18px;
}
.mv-button--lg {
    height: 48px;
    padding: 0 24px;
    font-size: 16px;
    border-radius: var(--app-radius-lg, 16px);
}

.mv-button--primary {
    background: #00b894;
    color: #fff;
}
.mv-button--primary:hover:not(:disabled) {
    background: #00a884;
}
.mv-button--primary:active:not(:disabled) {
    background: #008a70;
}

.mv-button--secondary {
    background: #fff;
    color: #17212b;
    border: 1.5px solid #e4e7ec;
}
.mv-button--secondary:hover:not(:disabled) {
    background: #f6f8fb;
    border-color: #00b894;
    color: #00b894;
}
.mv-button--secondary:active:not(:disabled) {
    background: #f0fffa;
}

.mv-button--catalog {
    background: #c8f21a;
    color: #1b2500;
}
.mv-button--catalog:hover:not(:disabled) {
    background: #b8e010;
    box-shadow: 0 8px 18px rgba(200, 242, 26, 0.35);
}
.mv-button--catalog:active:not(:disabled) {
    background: #a8cc0a;
}

.mv-button--buy {
    background: var(--app-accent-orange, #ff8a00);
    color: #fff;
}
.mv-button--buy:hover:not(:disabled) {
    background: var(--app-accent-orange-hover, #e67c00);
}
.mv-button--buy:active:not(:disabled) {
    background: var(--app-accent-orange-active, #cc6e00);
}

.mv-button--ghost {
    background: transparent;
    color: #00b894;
    border: 1.5px solid #00b894;
}
.mv-button--ghost:hover:not(:disabled) {
    background: #f0fffa;
}
.mv-button--ghost:active:not(:disabled) {
    background: #c8f7ec;
}

.mv-button--danger {
    background: #ef4444;
    color: #fff;
}
.mv-button--danger:hover:not(:disabled) {
    background: #dc2626;
}
.mv-button--danger:active:not(:disabled) {
    background: #b91c1c;
}

.mv-button--disabled,
.mv-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
}

.mv-button--loading {
    cursor: wait;
    pointer-events: none;
}

.mv-button__spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: mv-spin 0.6s linear infinite;
    flex-shrink: 0;
}

@keyframes mv-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
