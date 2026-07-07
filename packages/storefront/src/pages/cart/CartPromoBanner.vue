<script setup lang="ts">
import { computed } from 'vue';
import { MvNotice, MvProgressBar } from '@mivend/ui-kit';
import { useCartStore } from '../../stores/cart';
import type { TierProgress } from '../../stores/cart';
import { formatTierValue } from '../../utils/discount';
import {
  discountTierComplete,
  discountTierCurrentSuffix,
  discountTierProgress,
} from '../../utils/discountMessages';

const cartStore = useCartStore();

// Progress toward a weight/amount tier ladder, per facet — keeps the entry closest to
// its threshold (or the highest reached, once maxed) in case multiple lines share the
// same facet. Already-active discounts are also shown per-line (CartItem price +
// tooltip); this banner is the "how much further" / "fully unlocked" nudge.
const tierProgressList = computed<TierProgress[]>(() => {
  const byFacet = new Map<string, TierProgress>();
  for (const line of cartStore.lines) {
    const tp = line.tierProgress;
    if (!tp) continue;
    const existing = byFacet.get(tp.facetName);
    if (!existing || tp.current > existing.current) byFacet.set(tp.facetName, tp);
  }
  return [...byFacet.values()];
});

function isComplete(tp: TierProgress): boolean {
  return tp.nextThreshold == null;
}
</script>

<template>
  <MvNotice v-if="tierProgressList.length > 0" variant="info" class="cart-promo-banner">
    <div v-for="tp in tierProgressList" :key="tp.facetName" class="cart-promo-banner__tier">
      <div class="cart-promo-banner__tier-label">
        <span
          class="cart-promo-banner__tier-icon"
          :class="isComplete(tp) ? 'cart-promo-banner__tier-icon--done' : 'cart-promo-banner__tier-icon--pending'"
        >{{ isComplete(tp) ? '✓' : '✗' }}</span>
        <strong>{{ tp.facetName }}</strong>:
        <template v-if="!isComplete(tp)">
          {{ discountTierProgress(
            formatTierValue(tp.current, tp.metric),
            formatTierValue(tp.nextThreshold!, tp.metric),
            tp.nextPercent!,
          ) }}
          <template v-if="tp.currentPercent">{{ discountTierCurrentSuffix(tp.currentPercent) }}</template>
        </template>
        <template v-else>
          {{ discountTierComplete(tp.currentPercent!) }}
        </template>
      </div>
      <MvProgressBar
        :value="isComplete(tp) ? 1 : tp.current"
        :max="isComplete(tp) ? 1 : tp.nextThreshold!"
      />
    </div>
  </MvNotice>
</template>

<style scoped>
.cart-promo-banner__tier + .cart-promo-banner__tier { margin-top: 10px; }
.cart-promo-banner__tier-label { display: flex; align-items: center; gap: 6px; font-size: 13px; margin-bottom: 4px; }

.cart-promo-banner__tier-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%;
  font-size: 10px; font-weight: 900; line-height: 1; flex-shrink: 0;
}
.cart-promo-banner__tier-icon--done { background: #d3f3e6; color: #008a64; }
.cart-promo-banner__tier-icon--pending { background: #fdeee0; color: #d97a1f; }
</style>
