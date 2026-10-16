<script setup lang="ts">
import type { OrderLineShortfallRow } from '../../api/orderLineEdit';

defineProps<{ rows: OrderLineShortfallRow[] }>();

const LIMITED_BY_LABEL: Record<string, string> = {
    warehouse: 'Warehouse stock',
    organization: "Selling organization's stock",
};
</script>

<template>
    <div class="order-shortfall" data-testid="order-shortfall">
        <p class="order-shortfall__hint">
            Quantity cut from this order because stock did not cover it. It is kept for demand
            statistics only.
        </p>
        <ul class="order-shortfall__list">
            <li v-for="row in rows" :key="row.id" class="order-shortfall__item">
                <span class="order-shortfall__product">
                    <strong>{{ row.sku ?? 'Unknown product' }}</strong>
                    <span v-if="row.name" class="order-shortfall__name">{{ row.name }}</span>
                </span>
                <span class="order-shortfall__qty">
                    {{ row.requestedQuantity }} requested, {{ row.keptQuantity }} kept,
                    <strong>{{ row.shortfallQuantity }} cut</strong>
                </span>
                <span class="order-shortfall__reason">
                    {{ row.limitedBy ? (LIMITED_BY_LABEL[row.limitedBy] ?? row.limitedBy) : '' }}
                    ·
                    {{ new Date(row.createdAt).toLocaleString('en-US') }}
                </span>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.order-shortfall {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
}
.order-shortfall__hint {
    margin: 0;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}
.order-shortfall__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.order-shortfall__item {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.order-shortfall__name,
.order-shortfall__reason {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}
.order-shortfall__name {
    margin-left: 8px;
}
</style>
