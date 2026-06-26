<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { shopApi } from '../../api/client';

interface ProductVariant {
  sku: string;
  price: number;
  currencyCode: string;
  stockLevel: string;
}

interface FacetValue {
  name: string;
  facet: { code: string };
}

interface Product {
  id: string;
  name: string;
  slug: string;
  variants: ProductVariant[];
  facetValues: FacetValue[];
}

const authStore = useAuthStore();
const products = ref<Product[]>([]);
const loading = ref(true);
const error = ref('');
const inStockOnly = ref(false);

const visibleProducts = computed(() =>
  inStockOnly.value
    ? products.value.filter(p => p.variants[0]?.stockLevel !== 'OUT_OF_STOCK')
    : products.value,
);

const categories = [
  'Масла и жидкости',
  'Фильтры',
  'Тормозная система',
  'Аккумуляторы',
  'Автохимия',
  'Инструмент',
];

function getBrand(product: Product): string {
  return product.facetValues.find(fv => fv.facet.code === 'brand')?.name ?? '';
}

function getStock(stockLevel: string): number | undefined {
  if (!stockLevel || stockLevel === 'OUT_OF_STOCK') return undefined;
  if (stockLevel === 'IN_STOCK') return undefined;
  const n = parseInt(stockLevel, 10);
  return isNaN(n) ? undefined : n;
}

async function fetchProducts(): Promise<void> {
  try {
    const result = await shopApi<{ products: { items: Product[] } }>(`
      query HomeProducts {
        products(options: { take: 8 }) {
          items {
            id name slug
            variants { sku price currencyCode stockLevel }
            facetValues { name facet { code } }
          }
        }
      }
    `);
    products.value = result.products.items;
  } catch {
    error.value = 'Не удалось загрузить товары';
  } finally {
    loading.value = false;
  }
}

onMounted(fetchProducts);
</script>

<template>
  <main class="home-page">
    <div class="home-page__inner">
      <aside class="home-page__sidebar">
        <h3 class="home-sidebar__title">Каталог</h3>
        <nav class="home-sidebar__cats">
          <a
            v-for="cat in categories"
            :key="cat"
            href="#"
            class="home-sidebar__cat"
          >
            <span>{{ cat }}</span>
            <span>&rsaquo;</span>
          </a>
        </nav>

        <div class="home-sidebar__filter">
          <div class="home-sidebar__filter-title">Наличие</div>
          <label class="home-sidebar__check">
            <input v-model="inStockOnly" type="checkbox" />
            <span>Только в наличии</span>
          </label>
        </div>
      </aside>

      <div class="home-page__content">
        <section class="home-products">
          <div class="home-products__header">
            <div>
              <h2 class="home-products__title">Популярные товары</h2>
              <p class="home-products__subtitle">
                {{ authStore.isLoggedIn
                  ? 'Актуальные остатки и цены для вашей торговой точки'
                  : 'Войдите, чтобы видеть цены и остатки' }}
              </p>
            </div>
          </div>

          <div v-if="loading" class="home-products__state">Загрузка...</div>

          <MvNotice v-else-if="error" variant="error">{{ error }}</MvNotice>

          <div v-else class="home-products__grid">
            <MvProductCard
              v-for="product in visibleProducts"
              :key="product.id"
              :name="product.name"
              :sku="product.variants[0]?.sku ?? ''"
              :brand="getBrand(product)"
              :price="product.variants[0] ? product.variants[0].price / 100 : undefined"
              :currency="product.variants[0]?.currencyCode ?? 'RUB'"
              :stock="getStock(product.variants[0]?.stockLevel ?? '')"
              :slug="product.slug"
              :show-prices="authStore.isLoggedIn"
              @add-to-cart="() => console.log('add-to-cart', product.slug)"
            />
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.home-page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.home-page__inner {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.home-page__sidebar {
  position: sticky;
  top: 92px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
  border: 1px solid rgba(221, 231, 226, 0.86);
}

.home-sidebar__title {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.home-sidebar__cats {
  display: grid;
  gap: 6px;
  margin-bottom: 18px;
}

.home-sidebar__cat {
  min-height: 40px;
  border-radius: 12px;
  padding: 0 12px;
  background: #f7fbfa;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #2c3b36;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid transparent;
}

.home-sidebar__cat:hover {
  background: #e2f8ef;
  color: #008a64;
  border-color: rgba(0, 168, 120, 0.24);
}

.home-sidebar__filter {
  border-top: 1px solid #edf2ef;
  padding-top: 16px;
  margin-top: 4px;
}

.home-sidebar__filter-title {
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #2c3b36;
  margin-bottom: 10px;
}

.home-sidebar__check {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #43524d;
  font-size: 14px;
  margin: 8px 0;
  cursor: pointer;
}

.home-sidebar__check input {
  accent-color: var(--el-color-primary, #00b894);
}

.home-products__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.home-products__title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.home-products__subtitle {
  margin: 0;
  color: #66736e;
  font-size: 14px;
}

.home-products__state {
  padding: 40px;
  text-align: center;
  color: #66736e;
  font-size: 15px;
}

.home-products__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 1180px) {
  .home-products__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .home-page__inner {
    grid-template-columns: 1fr;
  }
  .home-page__sidebar {
    position: static;
  }
  .home-products__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .home-page {
    padding-left: 16px;
    padding-right: 16px;
  }
  .home-products__grid {
    grid-template-columns: 1fr;
  }
}
</style>
