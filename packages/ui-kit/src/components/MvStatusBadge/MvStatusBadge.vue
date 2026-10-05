<script setup lang="ts">
// Generic status pill for backoffice screens (order/approval/document statuses) — distinct
// from MvStatusTag, whose variants are storefront product/cart states (in-stock, in-cart, ...).
export type StatusBadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

withDefaults(defineProps<{ variant?: StatusBadgeVariant }>(), { variant: 'neutral' });
</script>

<template>
    <span :class="['mv-status-badge', `mv-status-badge--${variant}`]">
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

.mv-status-badge--neutral {
    background: #f1f5f9;
    color: #475569;
}
.mv-status-badge--success {
    background: #d1fae5;
    color: #065f46;
}
.mv-status-badge--warning {
    background: #fef3c7;
    color: #92400e;
}
.mv-status-badge--danger {
    background: #fee2e2;
    color: #991b1b;
}
.mv-status-badge--info {
    background: #e0f2fe;
    color: #0c4a6e;
}
</style>
