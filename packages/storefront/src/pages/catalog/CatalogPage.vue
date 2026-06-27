<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { shopApi } from '../../api/client';
import CatalogFacets from './CatalogFacets.vue';

interface ProductVariant {
    id: string;
    sku: string;
    price: number;
    customerPrice: number | null;
    currencyCode: string;
    stockLevel: string;
}

interface FacetValue {
    id: string;
    name: string;
    facet: { code: string; name: string };
}

interface Product {
    id: string;
    name: string;
    slug: string;
    variants: ProductVariant[];
    facetValues: FacetValue[];
}

type ViewMode = 'list' | 'grid';

const route = useRoute();
const authStore = useAuthStore();
const cartStore = useCartStore();

const products = ref<Product[]>([]);
const loading = ref(true);
const error = ref('');
const viewMode = ref<ViewMode>('list');
const sortKey = ref('stock');
const searchQuery = ref((route.query.q as string) ?? '');

const inStockOnly = ref(false);
const selectedFacetValues = ref(new Set<string>());

const facetGroups = computed(() => {
    const map = new Map<string, { code: string; name: string; values: Map<string, string> }>();
    for (const p of products.value) {
        for (const fv of p.facetValues) {
            if (!map.has(fv.facet.code)) {
                map.set(fv.facet.code, { code: fv.facet.code, name: fv.facet.name, values: new Map() });
            }
            map.get(fv.facet.code)!.values.set(fv.id, fv.name);
        }
    }
    return [...map.values()].map(g => ({
        code: g.code,
        name: g.name,
        values: [...g.values.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    }));
});

function getStockNum(stockLevel: string): number {
    if (!stockLevel || stockLevel === 'OUT_OF_STOCK') return 0;
    if (stockLevel === 'IN_STOCK') return 999;
    const n = parseInt(stockLevel, 10);
    return isNaN(n) ? 999 : n;
}

function stockVariantFor(stockLevel: string): 'ok' | 'low' | 'out' {
    if (stockLevel === 'OUT_OF_STOCK') return 'out';
    if (stockLevel === 'LOW_STOCK') return 'low';
    return 'ok';
}

function stockProps(stockLevel: string): { stockVariant?: 'ok' | 'low' | 'out' } {
    if (!authStore.isLoggedIn) return {};
    return { stockVariant: stockVariantFor(stockLevel) };
}

function getBrand(product: Product): string {
    return product.facetValues.find(fv => fv.facet.code === 'brand')?.name ?? '';
}

const visibleProducts = computed(() => {
    let list = products.value;
    if (inStockOnly.value) list = list.filter(p => getStockNum(p.variants[0]?.stockLevel ?? '') > 0);
    if (selectedFacetValues.value.size > 0) {
        list = list.filter(p => p.facetValues.some(fv => selectedFacetValues.value.has(fv.id)));
    }
    if (sortKey.value === 'stock') {
        list = [...list].sort((a, b) =>
            getStockNum(b.variants[0]?.stockLevel ?? '') - getStockNum(a.variants[0]?.stockLevel ?? ''));
    } else if (sortKey.value === 'price-asc') {
        list = [...list].sort((a, b) => (a.variants[0]?.price ?? 0) - (b.variants[0]?.price ?? 0));
    } else if (sortKey.value === 'brand') {
        list = [...list].sort((a, b) => getBrand(a).localeCompare(getBrand(b)));
    }
    return list;
});

function toggleFacetValue(id: string): void {
    const next = new Set(selectedFacetValues.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedFacetValues.value = next;
}

function resetFilters(): void {
    inStockOnly.value = false;
    selectedFacetValues.value = new Set();
    sortKey.value = 'stock';
}

async function fetchProducts(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        const q = searchQuery.value
            ? `, filter: { name: { contains: "${searchQuery.value}" } }`
            : '';
        const result = await shopApi<{ products: { items: Product[] } }>(`
            query CatalogProducts {
                products(options: { take: 40${q} }) {
                    items {
                        id name slug
                        variants { id sku price customerPrice currencyCode stockLevel }
                        facetValues { id name facet { code name } }
                    }
                }
            }
        `);
        products.value = result.products.items;
    } catch {
        error.value = 'Failed to load products';
    } finally {
        loading.value = false;
    }
}

watch(() => route.query.q, (q) => {
    searchQuery.value = (q as string) ?? '';
    fetchProducts();
});

onMounted(fetchProducts);
</script>

<template>
    <main class="catalog-page">
        <div class="catalog-page__inner">
            <CatalogFacets
                :facet-groups="facetGroups"
                :in-stock-only="inStockOnly"
                :selected-facet-values="selectedFacetValues"
                @update:in-stock-only="inStockOnly = $event"
                @toggle-facet-value="toggleFacetValue"
                @reset="resetFilters"
            />

            <section class="catalog-main">
                <div class="catalog-toolbar">
                    <div class="catalog-toolbar__top">
                        <div>
                            <div class="catalog-toolbar__title">
                                {{ searchQuery ? `Search: "${searchQuery}"` : 'Product catalog' }}
                            </div>
                            <div class="catalog-toolbar__note">
                                {{ loading ? 'Loading...' : `${visibleProducts.length} products found` }}
                            </div>
                        </div>
                        <div class="catalog-toolbar__right">
                            <select v-model="sortKey" class="catalog-toolbar__select">
                                <option value="stock">In stock first</option>
                                <option value="price-asc">Lowest price first</option>
                                <option value="brand">By brand</option>
                            </select>
                            <div class="catalog-toolbar__view">
                                <button
                                    :class="['catalog-toolbar__view-btn', { 'catalog-toolbar__view-btn--active': viewMode === 'grid' }]"
                                    type="button"
                                    @click="viewMode = 'grid'"
                                >&#9638; Grid</button>
                                <button
                                    :class="['catalog-toolbar__view-btn', { 'catalog-toolbar__view-btn--active': viewMode === 'list' }]"
                                    type="button"
                                    @click="viewMode = 'list'"
                                >&#9783; List</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="loading" class="catalog-state">Loading products...</div>
                <MvNotice v-else-if="error" variant="error">{{ error }}</MvNotice>
                <div v-else-if="visibleProducts.length === 0" class="catalog-state">No products found</div>

                <template v-else-if="viewMode === 'list'">
                    <div class="catalog-list">
                        <div class="catalog-list__header">
                            <span></span><span>Product</span><span>SKU</span>
                            <span>Stock</span><span>Multiplicity</span><span>Price</span><span>Order</span>
                        </div>
                        <MvProductRow
                            v-for="product in visibleProducts"
                            :key="product.id"
                            :name="product.name"
                            :sku="product.variants[0]?.sku ?? ''"
                            :brand="getBrand(product)"
                            :price="product.variants[0] ? product.variants[0].price / 100 : undefined"
                            :customer-price="product.variants[0]?.customerPrice != null ? product.variants[0].customerPrice / 100 : undefined"
                            :currency="product.variants[0]?.currencyCode ?? 'RUB'"
                            :slug="product.slug"
                            :show-prices="authStore.isLoggedIn"
                            :variant-id="product.variants[0]?.id"
                            v-bind="stockProps(product.variants[0]?.stockLevel ?? '')"
                            @add-to-cart="(qty: number, variantId: string | undefined) => variantId && cartStore.addItem(variantId, qty)"
                            @view-analogs="() => {}"
                        />
                    </div>
                </template>

                <template v-else>
                    <div class="catalog-grid">
                        <MvProductCard
                            v-for="product in visibleProducts"
                            :key="product.id"
                            :name="product.name"
                            :sku="product.variants[0]?.sku ?? ''"
                            :brand="getBrand(product)"
                            :price="product.variants[0] ? product.variants[0].price / 100 : undefined"
                            :customer-price="product.variants[0]?.customerPrice != null ? product.variants[0].customerPrice / 100 : undefined"
                            :currency="product.variants[0]?.currencyCode ?? 'RUB'"
                            :slug="product.slug"
                            :show-prices="authStore.isLoggedIn"
                            :variant-id="product.variants[0]?.id"
                            v-bind="stockProps(product.variants[0]?.stockLevel ?? '')"
                            @add-to-cart="(variantId: string | undefined) => variantId && cartStore.addItem(variantId, 1)"
                        />
                    </div>
                </template>
            </section>
        </div>
    </main>
</template>

<style scoped>
.catalog-page {
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.catalog-page__inner {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 22px;
    align-items: start;
}

.catalog-main { min-width: 0; }

.catalog-toolbar {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #edf3f0;
    padding: 14px 18px;
    margin-bottom: 14px;
    box-shadow: 0 4px 12px rgba(27, 45, 38, 0.05);
}

.catalog-toolbar__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
}

.catalog-toolbar__title { font-size: 18px; font-weight: 900; letter-spacing: -0.03em; color: #14231f; }
.catalog-toolbar__note { font-size: 13px; color: #66736e; margin-top: 2px; }
.catalog-toolbar__right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

.catalog-toolbar__select {
    height: 36px;
    padding: 0 10px;
    border: 1.5px solid #dde7e2;
    border-radius: 10px;
    background: #fff;
    font-size: 13px;
    font-family: inherit;
    color: #2c3b36;
    cursor: pointer;
}

.catalog-toolbar__view { display: flex; border: 1.5px solid #dde7e2; border-radius: 10px; overflow: hidden; }

.catalog-toolbar__view-btn {
    height: 36px;
    padding: 0 12px;
    border: none;
    background: transparent;
    font-size: 13px;
    font-family: inherit;
    color: #66736e;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
}

.catalog-toolbar__view-btn:hover { background: #f4faf7; }
.catalog-toolbar__view-btn--active { background: #00b894; color: #fff; }

.catalog-list {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #edf3f0;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(27, 45, 38, 0.05);
}

.catalog-list__header {
    display: grid;
    grid-template-columns: 64px minmax(160px, 1fr) 120px 100px 90px 110px 140px;
    padding: 10px 16px;
    background: #f7fbfa;
    border-bottom: 2px solid #edf3f0;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #66736e;
}

.catalog-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }

.catalog-state {
    padding: 60px;
    text-align: center;
    color: #66736e;
    font-size: 15px;
    background: #fff;
    border-radius: 16px;
    border: 1px solid #edf3f0;
}

@media (max-width: 1200px) { .catalog-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

@media (max-width: 960px) {
    .catalog-page__inner { grid-template-columns: 1fr; }
}

@media (max-width: 640px) { .catalog-page { padding-left: 16px; padding-right: 16px; } }
</style>
