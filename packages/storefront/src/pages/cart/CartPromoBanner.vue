<script setup lang="ts">
import { computed } from 'vue';
import { MvNotice } from '@mivend/ui-kit';
import { useCartStore } from '../../stores/cart';

const cartStore = useCartStore();

interface ActiveDiscount {
  brand: string;
  percent: number;
}

const activeDiscounts = computed<ActiveDiscount[]>(() => {
  const byBrand = new Map<string, number>();
  for (const line of cartStore.lines) {
    if (line.compareAtPrice == null || line.unitPrice == null) continue;
    const percent = Math.round((1 - line.unitPrice / line.compareAtPrice) * 100);
    if (percent <= 0) continue;
    const brand = line.productVariant.product.facetValues.find(fv => fv.facet.code === 'brand')?.name;
    if (!brand) continue;
    const existing = byBrand.get(brand) ?? 0;
    if (percent > existing) byBrand.set(brand, percent);
  }
  return [...byBrand.entries()].map(([brand, percent]) => ({ brand, percent }));
});
</script>

<template>
  <MvNotice v-if="activeDiscounts.length > 0" variant="success" class="cart-promo-banner">
    <div v-for="d in activeDiscounts" :key="d.brand">
      Скидка на бренд <strong>{{ d.brand }}</strong>: −{{ d.percent }}%
    </div>
  </MvNotice>
</template>

<style scoped>
.cart-promo-banner { margin-bottom: 16px; }
</style>
