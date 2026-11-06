<script setup lang="ts">
import type { CartLine } from '../../stores/cart';
import CartItem from './CartItem.vue';

defineProps<{
    title: string;
    note: string;
    lines: CartLine[];
    checkedIds: Set<string>;
    blocked?: boolean;
}>();
const emit = defineEmits<{ 'update:checked': [id: string, value: boolean] }>();
</script>

<template>
    <div class="line-group__title" :class="{ 'line-group__title--blocked': blocked }">
        <span>{{ title }}</span>
        <small>{{ $t('cart.groupCount', { items: $t('cart.items', lines.length), note }) }}</small>
    </div>

    <div class="line-group__items">
        <div v-if="!blocked" class="line-group__columns" aria-hidden="true">
            <span>{{ $t('cart.product') }}</span>
            <span>{{ $t('cart.price') }}</span>
            <span>{{ $t('cart.quantity') }}</span>
            <span>{{ $t('cart.total') }}</span>
        </div>
        <CartItem
            v-for="line in lines"
            :key="line.id"
            :line="line"
            :checked="checkedIds.has(line.id)"
            @update:checked="emit('update:checked', line.id, $event)"
        />
    </div>
</template>

<style scoped>
.line-group__title {
    margin: 0 16px;
    padding: 14px 16px;
    border-radius: 18px;
    background: var(--el-bg-color-page);
    font-size: 17px;
    font-weight: 950;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
}
.line-group__title--blocked {
    background: var(--app-danger2-bg);
    color: var(--app-danger-fg);
}
.line-group__title small {
    color: var(--app-nav-label);
    font-size: 13px;
    font-weight: 800;
}
.line-group__title--blocked small {
    color: var(--app-danger-fg);
}

.line-group__items {
    padding: 0 16px 4px;
}

.line-group__columns {
    display: grid;
    grid-template-columns: 28px 96px minmax(0, 1fr) 112px 150px 120px;
    gap: 14px;
    padding: 10px 0 0;
    color: var(--app-nav-label);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
}
.line-group__columns span:nth-child(1) {
    grid-column: 3;
}
@media (max-width: 900px) {
    .line-group__columns {
        display: none;
    }
}
</style>
