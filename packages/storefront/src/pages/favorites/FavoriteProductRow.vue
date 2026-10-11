<script setup lang="ts">
import { computed } from 'vue';
import { usePackagesOnly } from '../../composables/usePackagesOnly';
import { packsToBase, salesUnitOf } from '../../composables/useSalesUnit';
import type { FavoriteProduct } from './FavoriteProductCard.vue';

const props = defineProps<{ product: FavoriteProduct }>();

const emit = defineEmits<{
    addToCart: [id: string, qty: number];
    remove: [id: string];
}>();

const { packagesOnly, load } = usePackagesOnly();
void load();

const unit = computed(() => salesUnitOf(props.product, packagesOnly.value));
const unitPrice = computed(() =>
    props.product.unitPrice !== undefined && unit.value
        ? Math.round(props.product.unitPrice * unit.value.ratio * 100) / 100
        : props.product.unitPrice,
);

function onAdd(qty: number): void {
    emit('addToCart', props.product.id, unit.value ? packsToBase(qty, unit.value) : qty);
}
</script>

<template>
    <MvProductRow
        :name="props.product.name"
        :sku="props.product.sku"
        :brand="props.product.brand"
        :stock-variant="props.product.stockVariant"
        :price="unitPrice"
        :customer-price="unitPrice"
        :currency="props.product.currency"
        :show-prices="true"
        :is-favorited="true"
        :unit-label="unit?.name ?? 'pc.'"
        :multiplicity-label="unit ? `${unit.packStep} ${unit.name}` : undefined"
        :qty-step="unit?.packStep ?? 1"
        @add-to-cart="onAdd"
        @toggle-favorite="() => emit('remove', props.product.id)"
        @view-analogs="() => {}"
    />
</template>
