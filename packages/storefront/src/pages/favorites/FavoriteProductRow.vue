<script setup lang="ts">
import type { FavoriteProduct } from './FavoriteProductCard.vue';

const props = defineProps<{ product: FavoriteProduct }>();

const emit = defineEmits<{
    addToCart: [id: string, qty: number];
    remove: [id: string];
}>();
</script>

<template>
  <MvProductRow
    :name="props.product.name"
    :sku="props.product.sku"
    :brand="props.product.brand"
    :stock-variant="props.product.stockVariant === 'ok' ? 'ok' : props.product.stockVariant === 'low' ? 'low' : 'out'"
    :show-prices="true"
    :is-favorited="true"
    @add-to-cart="(qty: number) => emit('addToCart', props.product.id, qty)"
    @toggle-favorite="() => emit('remove', props.product.id)"
    @view-analogs="() => {}"
  />
</template>
