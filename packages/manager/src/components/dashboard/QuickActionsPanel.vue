<script setup lang="ts">
const actions = [
    {
        label: 'New order',
        description: 'Create an order on behalf of a customer.',
        to: '/orders/new',
    },
    {
        label: 'Find customer',
        description: 'Open customer card, orders and documents.',
        to: '/customers',
    },
    {
        label: 'New discount',
        description: 'Submit a discount grant approval request.',
        to: '/discounts',
    },
    {
        label: 'New client',
        description: 'Register a new customer/counterparty.',
        to: '/customers/new',
    },
];
</script>

<template>
    <div class="quick-actions">
        <RouterLink v-for="action in actions" :key="action.to" class="quick-actions__item" :to="action.to">
            <strong>{{ action.label }}</strong>
            <span>{{ action.description }}</span>
        </RouterLink>
    </div>
</template>

<style scoped>
.quick-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.quick-actions__item {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: 76px;
    padding: 12px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 14px);
    background: #fff;
    color: inherit;
    text-decoration: none;
    transition:
        border-color 0.16s ease,
        transform 0.16s ease;
}

.quick-actions__item:hover {
    border-color: var(--el-color-primary, #00b894);
    transform: translateY(-1px);
}

.quick-actions__item strong {
    font-size: 13px;
    color: var(--el-text-color-primary, #17212b);
}

.quick-actions__item span {
    font-size: 12px;
    color: var(--el-text-color-secondary, #667085);
    line-height: 1.35;
}
</style>
