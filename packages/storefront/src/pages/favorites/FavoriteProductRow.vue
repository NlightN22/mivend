<script setup lang="ts">
import type { FavoriteProduct } from './FavoriteProductCard.vue';

const props = defineProps<{ product: FavoriteProduct }>();

const emit = defineEmits<{
    addToCart: [id: string, qty: number];
}>();
</script>

<template>
  <MvProductRow
    :name="props.product.name"
    :sku="props.product.sku"
    :brand="props.product.brand"
    :stock-variant="props.product.stockVariant === 'ok' ? 'ok' : props.product.stockVariant === 'low' ? 'low' : 'out'"
    :show-prices="true"
    @add-to-cart="(qty: number) => emit('addToCart', props.product.id, qty)"
    @view-analogs="() => {}"
  />
</template>
