<script setup lang="ts">
export type IconButtonVariant = 'default' | 'primary' | 'orange';

defineProps<{
    label: string;
    variant?: IconButtonVariant;
    title?: string;
}>();
</script>

<template>
    <button
        class="mv-icon-btn"
        :class="`mv-icon-btn--${variant ?? 'default'}`"
        :title="title ?? label"
        type="button"
    >
        <span class="mv-icon-btn__icon"><slot /></span>
        <span class="mv-icon-btn__label">{{ label }}</span>
    </button>
</template>

<style scoped>
.mv-icon-btn {
    border: 0;
    width: 52px;
    padding: 8px 4px 6px;
    border-radius: 12px;
    font: inherit;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    transition:
        background 0.14s,
        color 0.14s;
    background: var(--app-fill-soft);
    color: var(--app-text-body3);
}

.mv-icon-btn:hover {
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
}

.mv-icon-btn--primary {
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
}
.mv-icon-btn--primary:hover {
    background: var(--el-color-primary-light-7);
}

.mv-icon-btn--orange {
    background: var(--app-orange-bg);
    color: var(--app-stock-low-fg);
}
.mv-icon-btn--orange:hover {
    background: var(--app-danger-bg);
}

.mv-icon-btn__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
}

.mv-icon-btn__label {
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
}
</style>
