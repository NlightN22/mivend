<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MvButton, MvProductGallery, MvProductMainCards } from '@mivend/ui-kit';
import {
    fetchProductBySlug,
    fetchCrossReferences,
    fetchPricesForVariant,
    type ProductDetail,
    type CrossReferenceRow,
    type PriceRow,
} from '../../api/productDetail';
import ManagerProductInfoPanel from '../../components/catalog/ManagerProductInfoPanel.vue';

const route = useRoute();
const router = useRouter();

const product = ref<ProductDetail | null>(null);
const crossReferences = ref<CrossReferenceRow[]>([]);
const prices = ref<PriceRow[]>([]);
const loading = ref(true);
const notFound = ref(false);

const category = computed(
    () => product.value?.facetValues.find(fv => fv.facetCode === 'category')?.name ?? '',
);
const brand = computed(
    () => product.value?.facetValues.find(fv => fv.facetCode === 'brand')?.name ?? '',
);
const primaryVariant = computed(() => product.value?.variants[0] ?? null);
const stockOnHand = computed(() => primaryVariant.value?.stockOnHand ?? 0);
const stockVariantLabel = computed((): 'ok' | 'low' | 'out' => {
    if (stockOnHand.value === 0) return 'out';
    if (stockOnHand.value < 10) return 'low';
    return 'ok';
});

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
            <div class="product-detail-page__breadcrumb">
                <RouterLink to="/catalog">Catalog</RouterLink> / {{ product.name }}
            </div>

            <div class="product-detail-page__layout">
                <MvProductGallery
                    class="product-detail-page__gallery"
                    :product-name="product.name"
                    :show-favorite="false"
                    :show-documents="false"
                />

                <MvProductMainCards
                    :name="product.name"
                    :sku="primaryVariant?.sku ?? ''"
                    description=""
                    :brand="brand"
                    :category="category"
                    :stock-variant-label="stockVariantLabel"
                    :related="[]"
                    link-base="/catalog"
                />

                <ManagerProductInfoPanel
                    class="product-detail-page__info"
                    :prices="prices"
                    :stock-on-hand="stockOnHand"
                />
            </div>

            <div v-if="crossReferences.length" class="product-detail-page__cross-refs">
                <h2 class="product-detail-page__section-title">Cross-references / applicability</h2>
                <table class="product-detail-page__table">
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
}

.product-detail-page__layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) 300px;
    gap: 18px;
    align-items: start;
}

.product-detail-page__cross-refs {
    background: #fff;
    border-radius: 20px;
    border: 1px solid rgba(221, 231, 226, 0.86);
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 20px;
}

.product-detail-page__section-title {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0 0 12px;
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

@media (max-width: 1100px) {
    .product-detail-page__layout {
        grid-template-columns: 1fr;
    }
}
</style>
