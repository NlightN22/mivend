<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { shopApi } from '../../api/client';
import ProductGallery from './ProductGallery.vue';
import ProductBuyPanel from './ProductBuyPanel.vue';
import ProductMainCards from './ProductMainCards.vue';

interface Variant { id: string; sku: string; price: number; currencyCode: string; stockLevel: string; }
interface FacetValue { name: string; facet: { code: string }; }
interface Product {
  id: string; name: string; slug: string; description: string;
  variants: Variant[];
  facetValues: FacetValue[];
}
interface RelatedProduct {
  id: string; name: string; slug: string;
  variants: { price: number; currencyCode: string; stockLevel: string }[];
  facetValues: FacetValue[];
}

const route = useRoute();
const authStore = useAuthStore();

const product = ref<Product | null>(null);
const related = ref<RelatedProduct[]>([]);
const loading = ref(true);
const error = ref('');

const variant = computed(() => product.value?.variants[0]);
const brand = computed(() => product.value?.facetValues.find(fv => fv.facet.code === 'brand')?.name ?? '');
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
      shopApi<{ product: Product | null }>(`
        query ProductDetail($slug: String!) {
          product(slug: $slug) {
            id name slug description
            variants { id sku price currencyCode stockLevel }
            facetValues { name facet { code } }
          }
        }`, { slug }),
      shopApi<{ products: { items: RelatedProduct[] } }>(`
        query RelatedProducts {
          products(options: { take: 5 }) {
            items {
              id name slug
              variants { price currencyCode stockLevel }
              facetValues { name facet { code } }
            }
          }
        }`),
    ]);
    product.value = detailRes.product;
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
      <nav class="product-page__crumbs">
        <RouterLink to="/">Главная</RouterLink>
        <span>/</span>
        <RouterLink to="/catalog">Каталог</RouterLink>
        <span>/</span>
        <span>{{ product.name }}</span>
      </nav>

      <div class="product-page__layout">
        <ProductGallery
          class="product-page__gallery"
          :product-name="product.name"
        />

        <ProductMainCards
          :name="product.name"
          :sku="variant?.sku ?? ''"
          :description="product.description"
          :brand="brand"
          :category="category"
          :stock-variant-label="stockVariantLabel"
          :related="related"
        />

        <ProductBuyPanel
          class="product-page__side"
          :price="variant ? variant.price / 100 : undefined"
          :currency="variant?.currencyCode ?? 'RUB'"
          :stock-level="variant?.stockLevel"
          :show-prices="authStore.isLoggedIn"
          :product-name="product.name"
          @add-to-cart="(qty) => console.log('add-to-cart', product?.slug, qty)"
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

.product-page__crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #66736e;
  margin-bottom: 20px;
}
.product-page__crumbs a { color: #66736e; text-decoration: none; }
.product-page__crumbs a:hover { color: #00b894; }
.product-page__crumbs span:last-child { color: #2c3b36; font-weight: 600; }

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
