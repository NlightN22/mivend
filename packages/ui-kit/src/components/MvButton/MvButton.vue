<script setup lang="ts">
export type ButtonVariant =
    | 'primary'
    | 'secondary'
    | 'catalog'
    | 'buy'
    | 'ghost'
    | 'subtle'
    | 'danger';
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
    background: var(--el-color-primary);
    color: var(--app-on-accent);
}
.mv-button--primary:hover:not(:disabled) {
    background: var(--app-primary-btn);
}
.mv-button--primary:active:not(:disabled) {
    background: var(--app-primary-btn-active);
}

.mv-button--secondary {
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    border: 1.5px solid var(--el-border-color);
}
.mv-button--secondary:hover:not(:disabled) {
    background: var(--el-bg-color-page);
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
}
.mv-button--secondary:active:not(:disabled) {
    background: var(--el-color-primary-light-9);
}

.mv-button--catalog {
    background: var(--app-lime-bg);
    color: var(--app-lime-fg);
}
.mv-button--catalog:hover:not(:disabled) {
    background: var(--app-lime-hover);
    box-shadow: 0 8px 18px var(--app-lime-glow);
}
.mv-button--catalog:active:not(:disabled) {
    background: var(--app-lime-active);
}

.mv-button--buy {
    background: var(--app-accent-orange);
    color: var(--app-on-accent);
}
.mv-button--buy:hover:not(:disabled) {
    background: var(--app-accent-orange-hover);
}
.mv-button--buy:active:not(:disabled) {
    background: var(--app-accent-orange-active);
}

.mv-button--ghost {
    background: transparent;
    color: var(--el-color-primary);
    border: 1.5px solid var(--el-color-primary);
}
.mv-button--ghost:hover:not(:disabled) {
    background: var(--el-color-primary-light-9);
}
.mv-button--ghost:active:not(:disabled) {
    background: var(--el-color-primary-light-7);
}

.mv-button--subtle {
    background: var(--app-row-hover);
    color: var(--app-nav-label);
    border: none;
}
.mv-button--subtle:hover:not(:disabled) {
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
}
.mv-button--subtle:active:not(:disabled) {
    background: var(--app-ghost-hover);
}

.mv-button--danger {
    background: var(--app-danger-btn);
    color: var(--app-on-accent);
}
.mv-button--danger:hover:not(:disabled) {
    background: var(--app-danger-btn-hover);
}
.mv-button--danger:active:not(:disabled) {
    background: var(--app-danger-btn-active);
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
