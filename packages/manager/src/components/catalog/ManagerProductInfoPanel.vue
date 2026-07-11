<script setup lang="ts">
import { MvAmountDisplay, MvStockBadge } from '@mivend/ui-kit';
import type { PriceRow } from '../../api/productDetail';

defineProps<{
    prices: PriceRow[];
    stockOnHand: number;
}>();
</script>

<template>
    <div class="manager-product-info-panel">
        <div class="manager-product-info-panel__card">
            <h2 class="manager-product-info-panel__title">Prices</h2>
            <p class="manager-product-info-panel__caption">Base prices are managed in the ERP system.</p>
            <div class="manager-product-info-panel__prices">
                <div v-for="row in prices" :key="row.priceTypeCode" class="manager-product-info-panel__price-row">
                    <span>{{ row.label }}</span>
                    <MvAmountDisplay v-if="row.price !== null" :amount="row.price / 100" currency="USD" size="sm" />
                    <span v-else class="manager-product-info-panel__no-price">—</span>
                </div>
            </div>
        </div>

        <div class="manager-product-info-panel__card">
            <h2 class="manager-product-info-panel__title">Stock</h2>
            <MvStockBadge :quantity="stockOnHand" />
        </div>
    </div>
</template>

<style scoped>
.manager-product-info-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.manager-product-info-panel__card {
    background: #fff;
    border-radius: 20px;
    border: 1px solid rgba(221, 231, 226, 0.86);
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 20px;
}

.manager-product-info-panel__title {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0 0 8px;
}

.manager-product-info-panel__caption {
    margin: 0 0 14px;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.manager-product-info-panel__prices {
    display: flex;
    flex-direction: column;
}

.manager-product-info-panel__price-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 9px 0;
    border-bottom: 1px dotted #dde7e2;
    font-size: 14px;
}

.manager-product-info-panel__price-row:last-child {
    border-bottom: none;
}

.manager-product-info-panel__no-price {
    color: var(--el-text-color-secondary, #a8b8b2);
}
</style>
