<script setup lang="ts">
import { computed } from 'vue';
import { useCurrency } from '../../composables/useCurrency';

// Manager-only info that MvProductRow itself has no first-class concept of — additional
// price-type columns beyond the single "base" price already shown by the row. Floor price
// is a dedicated MvProductRow column now (showFloorPrice/floorPrice props), not rendered
// here — see CatalogPage.vue.
const props = defineProps<{
    variantId: string;
    extraPriceColumns: { priceTypeCode: string; label: string; prices: Map<string, number> }[];
}>();

const { formatMinorExact: money } = useCurrency();

const rows = computed(() => {
    const out: { label: string; value: string }[] = [];
    for (const col of props.extraPriceColumns) {
        const price = col.prices.get(props.variantId);
        if (price !== undefined) out.push({ label: col.label, value: money(price) });
    }
    return out;
});
</script>

<template>
    <div v-if="rows.length" class="catalog-row-extras">
        <span v-for="row in rows" :key="row.label" class="catalog-row-extras__item">
            {{ row.label }}: <strong>{{ row.value }}</strong>
        </span>
    </div>
</template>

<style scoped>
.catalog-row-extras {
    display: flex;
    gap: 18px;
    padding: 0 16px 10px 128px;
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
    background: #fff;
    border-bottom: 1px solid #edf3f0;
}

.catalog-row-extras__item strong {
    color: var(--el-text-color-primary, #14231f);
}
</style>
