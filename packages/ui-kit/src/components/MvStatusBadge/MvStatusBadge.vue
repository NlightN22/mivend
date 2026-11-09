<script setup lang="ts">
// Generic status pill for backoffice screens (order/approval/document statuses) — distinct
// from MvStatusTag, whose variants are storefront product/cart states (in-stock, in-cart, ...).
export type StatusBadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

// `clamp` wraps long text inside the column to two lines instead of widening the cell.
withDefaults(defineProps<{ variant?: StatusBadgeVariant; clamp?: boolean }>(), {
    variant: 'neutral',
    clamp: false,
});
</script>

<template>
    <span
        :class="[
            'mv-status-badge',
            `mv-status-badge--${variant}`,
            { 'mv-status-badge--clamp': clamp },
        ]"
    >
        <slot />
    </span>
</template>

<style scoped>
.mv-status-badge {
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

.mv-status-badge--clamp {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    max-width: 100%;
    white-space: normal;
    line-height: 16px;
}

.mv-status-badge--neutral {
    background: var(--app-slate-bg);
    color: var(--app-text-body3);
}
.mv-status-badge--success {
    background: var(--app-ok-bg);
    color: var(--app-ok-fg);
}
.mv-status-badge--warning {
    background: var(--app-warn-bg);
    color: var(--app-warn-fg);
}
.mv-status-badge--danger {
    background: var(--app-danger-bg);
    color: var(--app-danger-fg);
}
.mv-status-badge--info {
    background: var(--app-info-bg);
    color: var(--app-info-fg);
}
</style>
