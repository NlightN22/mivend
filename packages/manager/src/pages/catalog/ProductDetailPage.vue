<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MvPanel, MvButton } from '@mivend/ui-kit';
import {
    fetchProductBySlug,
    fetchCrossReferences,
    fetchPricesForVariant,
    type ProductDetail,
    type CrossReferenceRow,
    type PriceRow,
} from '../../api/productDetail';

const route = useRoute();
const router = useRouter();

const product = ref<ProductDetail | null>(null);
const crossReferences = ref<CrossReferenceRow[]>([]);
const prices = ref<PriceRow[]>([]);
const loading = ref(true);
const notFound = ref(false);

const category = computed(
    () => product.value?.facetValues.find(fv => fv.facetCode === 'category')?.name ?? '—',
);
const brand = computed(
    () => product.value?.facetValues.find(fv => fv.facetCode === 'brand')?.name ?? '—',
);
const primaryVariant = computed(() => product.value?.variants[0] ?? null);
const stockOnHand = computed(() => primaryVariant.value?.stockOnHand ?? 0);

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        amount / 100,
    );
}

onMounted(async () => {
    loading.value = true;
    try {
        const slug = route.params.slug as string;
        const found = await fetchProductBySlug(slug);
        if (!found) {
            notFound.value = true;
            return;
        }
        product.value = found;
        const variantId = found.variants[0]?.id;
        [crossReferences.value, prices.value] = await Promise.all([
            fetchCrossReferences(found.id),
            variantId ? fetchPricesForVariant(variantId) : Promise.resolve([]),
        ]);
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <div class="product-detail-page">
        <div v-if="!loading && notFound" class="product-detail-page__not-found">
            <h1>Product not found</h1>
            <RouterLink to="/catalog">Back to catalog</RouterLink>
        </div>

        <template v-else-if="!loading && product">
            <div class="product-detail-page__header">
                <div class="product-detail-page__breadcrumb">Catalog / {{ product.name }}</div>
                <h1 class="product-detail-page__title">{{ product.name }}</h1>
                <div class="product-detail-page__meta">
                    <span>SKU: {{ primaryVariant?.sku ?? '—' }}</span>
                    <span>Category: {{ category }}</span>
                    <span>Brand: {{ brand }}</span>
                </div>
            </div>

            <div class="product-detail-page__grid">
                <MvPanel title="Prices">
                    <p class="product-detail-page__caption">Base prices are managed in the ERP system.</p>
                    <table class="product-detail-page__table">
                        <thead>
                            <tr>
                                <th>Price type</th>
                                <th>Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in prices" :key="row.priceTypeCode">
                                <td>{{ row.label }}</td>
                                <td>{{ row.price !== null ? money(row.price) : '—' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </MvPanel>

                <MvPanel title="Stock">
                    <p class="product-detail-page__stock">{{ stockOnHand }} units on hand</p>
                </MvPanel>

                <MvPanel title="Cross-references / applicability" class="product-detail-page__wide">
                    <table v-if="crossReferences.length" class="product-detail-page__table">
                        <thead>
                            <tr>
                                <th>OEM code</th>
                                <th>OEM brand</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="ref in crossReferences" :key="`${ref.oemBrand}-${ref.oemCode}`">
                                <td>{{ ref.oemCode }}</td>
                                <td>{{ ref.oemBrand }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-else class="product-detail-page__caption">No known cross-references for this product.</p>
                </MvPanel>
            </div>

            <div class="product-detail-page__actions">
                <MvButton @click="router.push('/orders/new')">
                    Request price adjustment for a specific order
                </MvButton>
                <p class="product-detail-page__hint">
                    Price adjustments only happen in the context of an order — open or start an
                    order to request one.
                </p>
            </div>
        </template>
    </div>
</template>

<style scoped>
.product-detail-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.product-detail-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.product-detail-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.product-detail-page__meta {
    display: flex;
    gap: 16px;
    margin-top: 8px;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.product-detail-page__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
}

.product-detail-page__wide {
    grid-column: 1 / -1;
}

.product-detail-page__caption {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin: 0 0 10px;
}

.product-detail-page__stock {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
}

.product-detail-page__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.product-detail-page__table th {
    text-align: left;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 6px 8px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.product-detail-page__table td {
    padding: 8px;
    border-bottom: 1px solid var(--el-border-color-lighter, #f0f2f5);
}

.product-detail-page__actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
}

.product-detail-page__hint {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
    margin: 0;
}

@media (max-width: 900px) {
    .product-detail-page__grid {
        grid-template-columns: 1fr;
    }
}
</style>
