<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { toast, MvProductGallery, MvProductMainCards } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { discountAddToCartHint } from '../../utils/discountMessages';
import { shopApi } from '../../api/client';
import {
  ProductDetailDocument,
  RelatedProductsDocument,
  type ProductDetailQuery,
  type RelatedProductsQuery,
} from '../../api/generated/graphql';
import ProductBuyPanel from './ProductBuyPanel.vue';

type Product = NonNullable<ProductDetailQuery['product']>;
type RelatedProduct = RelatedProductsQuery['products']['items'][number];

const route = useRoute();
const authStore = useAuthStore();
const cartStore = useCartStore();

const product = ref<Product | null>(null);
const related = ref<RelatedProduct[]>([]);
const loading = ref(true);
const error = ref('');

const variant = computed(() => product.value?.variants[0]);
const brand = computed(() => product.value?.facetValues.find(fv => fv.facet.code === 'brand')?.name ?? '');

async function handleAddToCart(qty: number): Promise<void> {
  if (!variant.value) return;
  // Toast reflects the actual applied discount from the mutation response, not a
  // catalog-level guess — see stores/cart.ts addItem().
  const discount = await cartStore.addItem(variant.value.id, qty);
  if (discount) toast(discountAddToCartHint(discount.percent, discount.brand), 'success');
}
const category = computed(() => product.value?.facetValues.find(fv => fv.facet.code === 'category')?.name ?? '');
const stockVariantLabel = computed((): 'ok' | 'low' | 'out' => {
  const sl = variant.value?.stockLevel ?? '';
  if (!sl || sl === 'OUT_OF_STOCK') return 'out';
  if (sl === 'LOW_STOCK') return 'low';
  return 'ok';
});

async function fetchData(slug: string) {
  loading.value = true;
  error.value = '';
  try {
    const [detailRes, relatedRes] = await Promise.all([
      shopApi(ProductDetailDocument, { slug }),
      shopApi(RelatedProductsDocument),
    ]);
    product.value = detailRes.product ?? null;
    related.value = relatedRes.products.items.filter(p => p.slug !== slug).slice(0, 3);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки товара';
  } finally {
    loading.value = false;
  }
}

watch(() => route.params.slug, (slug) => { if (slug) fetchData(slug as string); });
onMounted(() => { fetchData(route.params.slug as string); });
</script>

<template>
  <main class="product-page">
    <div v-if="loading" class="product-page__state">Загрузка товара...</div>
    <MvNotice v-else-if="error" variant="error">{{ error }}</MvNotice>
    <MvNotice v-else-if="!product" variant="error">Товар не найден</MvNotice>

    <template v-else>
      <MvBreadcrumbs
        class="product-page__crumbs"
        :items="[
          { label: 'Главная', to: '/' },
          { label: 'Каталог', to: '/catalog' },
          { label: product.name },
        ]"
      />

      <div class="product-page__layout">
        <MvProductGallery
          class="product-page__gallery"
          :product-name="product.name"
        />

        <MvProductMainCards
          :name="product.name"
          :sku="variant?.sku ?? ''"
          :description="product.description"
          :brand="brand"
          :category="category"
          :stock-variant-label="stockVariantLabel"
          :related="related"
          :show-related-prices="authStore.isLoggedIn"
        />

        <ProductBuyPanel
          class="product-page__side"
          :price="variant ? (variant.customerPrice ?? variant.price) / 100 : undefined"
          :compare-at-price="variant?.compareAtPrice != null ? variant.compareAtPrice / 100 : undefined"
          :currency="variant?.currencyCode ?? 'RUB'"
          :stock-level="variant?.stockLevel"
          :show-prices="authStore.isLoggedIn"
          :product-name="product.name"
          @add-to-cart="handleAddToCart"
        />
      </div>
    </template>
  </main>
</template>

<style scoped>
.product-page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.product-page__state {
  padding: 80px;
  text-align: center;
  color: #66736e;
  font-size: 15px;
}

.product-page__crumbs { margin-bottom: 20px; }

.product-page__layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: start;
}

.product-page__gallery { position: sticky; top: 92px; }
.product-page__side { position: sticky; top: 92px; }

@media (max-width: 1200px) {
  .product-page__layout { grid-template-columns: 240px minmax(0,1fr) 270px; }
}
@media (max-width: 960px) {
  .product-page__layout { grid-template-columns: 1fr; }
  .product-page__gallery, .product-page__side { position: static; }
}
@media (max-width: 640px) {
  .product-page { padding-left: 16px; padding-right: 16px; }
}
</style>
