<script setup lang="ts">
import { computed } from 'vue';
import MvStockBadge from '../MvStockBadge/MvStockBadge.vue';
import MvAmountDisplay from '../MvAmountDisplay/MvAmountDisplay.vue';

interface FacetValue { name: string; facet: { code: string }; }
interface RelatedProduct {
  id: string; name: string; slug: string;
  variants: { price: number; currencyCode: string; stockLevel: string }[];
  facetValues: FacetValue[];
}

interface Props {
  name: string;
  sku: string;
  description: string;
  brand: string;
  category: string;
  stockVariantLabel: 'ok' | 'low' | 'out';
  related: RelatedProduct[];
  // Whether the caller can see a price for related/analog products at all — storefront passes
  // authStore.isLoggedIn, manager passes its own catalog-price-read permission check. Kept as a
  // plain prop (not a store import) so this component has no dependency on either app's stores.
  showRelatedPrices?: boolean;
  // Storefront shows "Add to cart" on each analog; manager's catalog is view-only (no cart).
  showAddToCartButton?: boolean;
  linkBase?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showRelatedPrices: false,
  showAddToCartButton: true,
  linkBase: '/product',
});

const specs = computed(() => {
  const rows = [
    { label: 'SKU', value: props.sku || '—' },
    { label: 'Brand', value: props.brand || '—' },
    { label: 'Category', value: props.category || '—' },
  ];
  if (props.description) rows.push({ label: 'Description', value: props.description });
  return rows;
});

function getBrand(p: RelatedProduct) {
  return p.facetValues.find(fv => fv.facet.code === 'brand')?.name ?? '';
}
</script>

<template>
  <section class="pmc">
    <!-- Title card -->
    <div class="pmc__card">
      <div class="pmc__labels">
        <MvStockBadge :variant="stockVariantLabel" />
        <span v-if="category" class="pmc__label">{{ category }}</span>
        <span v-if="brand" class="pmc__label pmc__label--brand">{{ brand }}</span>
      </div>
      <h1 class="pmc__title">{{ name }}</h1>
      <div class="pmc__meta">
        <span>SKU: <strong>{{ sku || '—' }}</strong></span>
        <span v-if="brand">Brand: <strong>{{ brand }}</strong></span>
      </div>
      <div class="pmc__mini">
        <div class="pmc__mini-item"><div class="pmc__mini-lbl">Category</div><div class="pmc__mini-val">{{ category || '—' }}</div></div>
        <div class="pmc__mini-item"><div class="pmc__mini-lbl">Unit</div><div class="pmc__mini-val">pc.</div></div>
        <div class="pmc__mini-item"><div class="pmc__mini-lbl">Multiplicity</div><div class="pmc__mini-val">1 pc.</div></div>
      </div>
    </div>

    <!-- Specs card -->
    <div class="pmc__card pmc__card--mt">
      <h2 class="pmc__section-title">Specifications</h2>
      <div class="pmc__specs">
        <div v-for="s in specs" :key="s.label" class="pmc__spec-row">
          <span>{{ s.label }}</span><strong>{{ s.value }}</strong>
        </div>
      </div>
    </div>

    <!-- Analogs card -->
    <div v-if="related.length" class="pmc__card pmc__card--mt">
      <h2 class="pmc__section-title">Analogs & Substitutes</h2>
      <p class="pmc__section-sub">Quick pick if you need a different manufacturer.</p>
      <div class="pmc__analogs">
        <div v-for="p in related.slice(0, 3)" :key="p.id" class="pmc__analog">
          <div class="pmc__analog-img">📦</div>
          <div class="pmc__analog-info">
            <RouterLink :to="`${linkBase}/${p.slug}`" class="pmc__analog-name">{{ p.name }}</RouterLink>
            <span class="pmc__analog-brand">{{ getBrand(p) }}</span>
          </div>
          <MvAmountDisplay
            v-if="showRelatedPrices && p.variants[0]"
            :amount="p.variants[0].price / 100"
            :currency="p.variants[0].currencyCode"
            size="sm"
            class="pmc__analog-price"
          />
          <button v-if="showAddToCartButton" class="pmc__analog-btn" type="button">Add to cart</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pmc__card {
  background: #fff; border-radius: 20px;
  border: 1px solid rgba(221,231,226,0.86); box-shadow: 0 14px 36px rgba(27,45,38,0.08); padding: 20px;
}
.pmc__card--mt { margin-top: 14px; }

.pmc__labels { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; align-items: center; }
.pmc__label { padding: 3px 10px; border-radius: 999px; background: #f4f9f7; font-size: 12px; font-weight: 700; color: #66736e; border: 1px solid #dde7e2; }
.pmc__label--brand { background: #f0f4ff; border-color: #c5d0f0; color: #3a4a9a; }

.pmc__title { margin: 0 0 10px; font-size: 22px; font-weight: 900; letter-spacing: -0.03em; color: #14231f; line-height: 1.2; }
.pmc__meta { display: flex; gap: 18px; font-size: 13px; color: #66736e; margin-bottom: 16px; }
.pmc__meta strong { color: #2c3b36; }

.pmc__mini { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding-top: 14px; border-top: 1px solid #edf2ef; }
.pmc__mini-lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #a8b8b2; margin-bottom: 4px; }
.pmc__mini-val { font-size: 14px; font-weight: 700; color: #2c3b36; }

.pmc__section-title { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 12px; }
.pmc__section-sub { margin: -8px 0 14px; font-size: 13px; color: #66736e; }

.pmc__specs { display: flex; flex-direction: column; }
.pmc__spec-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 9px 0; border-bottom: 1px dotted #dde7e2; font-size: 14px; }
.pmc__spec-row:last-child { border-bottom: none; }
.pmc__spec-row span { color: #66736e; }
.pmc__spec-row strong { color: #14231f; font-weight: 700; text-align: right; }

.pmc__analogs { display: flex; flex-direction: column; }
.pmc__analog { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #edf2ef; }
.pmc__analog:last-child { border-bottom: none; }
.pmc__analog-img { width: 40px; height: 40px; border-radius: 10px; background: #f4f9f7; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.pmc__analog-info { flex: 1; min-width: 0; }
.pmc__analog-name { display: block; font-size: 13px; font-weight: 700; color: #14231f; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pmc__analog-name:hover { color: #00b894; }
.pmc__analog-brand { font-size: 12px; color: #66736e; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.pmc__analog-price { font-size: 15px; font-weight: 900; color: #14231f; white-space: nowrap; flex-shrink: 0; }
.pmc__analog-btn { height: 34px; padding: 0 12px; border: 1.5px solid #ff8a00; border-radius: 10px; background: transparent; color: #ff8a00; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; flex-shrink: 0; transition: background 0.15s, color 0.15s; }
.pmc__analog-btn:hover { background: #ff8a00; color: #fff; }
</style>
