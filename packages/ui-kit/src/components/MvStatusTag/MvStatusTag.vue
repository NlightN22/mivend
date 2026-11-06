<script setup lang="ts">
export type StatusTagVariant =
    | 'in-stock'
    | 'low-stock'
    | 'by-order'
    | 'promo'
    | 'analog'
    | 'original'
    | 'in-cart'
    | 'reserved'
    | 'unavailable';

interface Props {
    variant: StatusTagVariant;
    label?: string;
}

defineProps<Props>();

const defaultLabels: Record<StatusTagVariant, string> = {
    'in-stock': 'In stock',
    'low-stock': 'Low stock',
    'by-order': 'By order',
    promo: 'Promo',
    analog: 'Analog',
    original: 'Original',
    'in-cart': 'In cart',
    reserved: 'Reserved',
    unavailable: 'Unavailable',
};
</script>

<template>
    <span :class="['mv-status-tag', `mv-status-tag--${variant}`]">
        <slot>{{ label ?? defaultLabels[variant] }}</slot>
    </span>
</template>

<style scoped>
.mv-status-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: var(--app-radius-sm, 8px);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    font-family: var(--app-font-family, Inter, system-ui, sans-serif);
    line-height: 20px;
}

.mv-status-tag--in-stock {
    background: var(--app-ok-bg);
    color: var(--app-ok-fg);
}
.mv-status-tag--low-stock {
    background: var(--app-warn-bg);
    color: var(--app-warn-fg);
}
.mv-status-tag--by-order {
    background: var(--app-info-bg);
    color: var(--app-info-fg);
}
.mv-status-tag--promo {
    background: var(--app-danger-bg);
    color: var(--app-danger-fg);
}
.mv-status-tag--analog {
    background: var(--app-violet-bg);
    color: var(--app-violet-fg);
}
.mv-status-tag--original {
    background: var(--el-color-primary-light-9);
    color: var(--app-ok-fg);
    border: 1px solid var(--el-color-primary);
}
.mv-status-tag--in-cart {
    background: var(--app-orange-bg);
    color: var(--app-orange-fg);
}
.mv-status-tag--reserved {
    background: var(--app-violet2-bg);
    color: var(--app-violet2-fg);
}
.mv-status-tag--unavailable {
    background: var(--app-slate-bg);
    color: var(--app-slate-fg);
}
</style>
