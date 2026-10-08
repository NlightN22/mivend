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
        <small>{{ lines.length }} items · {{ note }}</small>
    </div>

    <div class="line-group__items">
        <div v-if="!blocked" class="line-group__columns" aria-hidden="true">
            <span>Product</span>
            <span>Price</span>
            <span>Quantity</span>
            <span>Total</span>
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
    background: #f6f9f8;
    font-size: 17px;
    font-weight: 950;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
}
.line-group__title--blocked {
    background: #fdecea;
    color: #b3261e;
}
.line-group__title small {
    color: #66736e;
    font-size: 13px;
    font-weight: 800;
}
.line-group__title--blocked small {
    color: #b3261e;
}

.line-group__items {
    padding: 0 16px 4px;
}

.line-group__columns {
    display: grid;
    grid-template-columns: 28px 96px minmax(0, 1fr) 112px 150px 120px;
    gap: 14px;
    padding: 10px 0 0;
    color: #66736e;
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
