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
        <slot>{{ defaultLabels[variant] }}</slot>
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
    background: #d1fae5;
    color: #065f46;
}
.mv-status-tag--low-stock {
    background: #fef3c7;
    color: #92400e;
}
.mv-status-tag--by-order {
    background: #e0f2fe;
    color: #0c4a6e;
}
.mv-status-tag--promo {
    background: #fee2e2;
    color: #991b1b;
}
.mv-status-tag--analog {
    background: #f3e8ff;
    color: #6b21a8;
}
.mv-status-tag--original {
    background: #f0fffa;
    color: #065f46;
    border: 1px solid #00b894;
}
.mv-status-tag--in-cart {
    background: #fff3e6;
    color: #9a4b00;
}
.mv-status-tag--reserved {
    background: #ede9fe;
    color: #4c1d95;
}
.mv-status-tag--unavailable {
    background: #f1f5f9;
    color: #64748b;
}
</style>
