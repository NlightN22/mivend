<script setup lang="ts">
import { brandOf } from '../../utils/brand';
import { facetSpecs } from '../../utils/productSpecs';
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    MvErrorState,
    MvProductGallery,
    MvProductMainCards,
    stockVariantFromLevel,
} from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { assetUrl } from '../../composables/assetUrl';
import { useCartActions } from '../../composables/useCartActions';
import { useCatalogStore } from '../../stores/catalog';
import { filterVisibleCrumbs } from '../../../../shared/src/collectionTree';
import { shopApi } from '../../api/client';
import { describeLoadError, type LoadErrorText } from '../../api/describeLoadError';
import { ProductDetailDocument, type ProductDetailQuery } from '../../api/generated/graphql';
import ProductBuyPanel from './ProductBuyPanel.vue';
import ProductSkeleton from './ProductSkeleton.vue';

type Product = NonNullable<ProductDetailQuery['product']>;

const route = useRoute();
const { t } = useI18n();
const authStore = useAuthStore();
const { cartLineFor, onAddToCart, onUpdateQty } = useCartActions();
const catalogStore = useCatalogStore();

const product = ref<Product | null>(null);
const loading = ref(true);
const error = ref<LoadErrorText | null>(null);

const galleryImages = computed(() =>
    (product.value?.assets ?? []).map(a => ({
        thumb: assetUrl(a.preview, 'thumb'),
        full: assetUrl(a.preview, 'large'),
    })),
);
const variant = computed(() => product.value?.variants[0]);
const brand = computed(() => brandOf(product.value?.manufacturer));

// A product can belong to several collections; the deepest one (most breadcrumbs) gives the
// most specific real ancestry path to show — breadcrumbs = [root, ...ancestors, self].
const deepestCollection = computed(
    () =>
        [...(product.value?.collections ?? [])].sort(
            (a, b) => b.breadcrumbs.length - a.breadcrumbs.length,
        )[0],
);
const breadcrumbItems = computed(() => {
    const deepest = deepestCollection.value;
    const trail = deepest
        ? filterVisibleCrumbs(deepest.breadcrumbs, catalogStore.collections).map(c => ({
              label: c.name,
              to: `/catalog?collection=${c.slug}`,
          }))
        : [];
    return [
        { label: t('catalogNav.home'), to: '/' },
        { label: t('nav.catalog'), to: '/catalog' },
        ...trail,
        { label: product.value?.name ?? '' },
    ];
});
const extraSpecs = computed(() => {
    const weight = variant.value?.customFields?.weight;
    const code = product.value?.customFields?.manufacturerPartNumber;
    return [
        ...(code ? [{ label: 'Manufacturer code', value: code }] : []),
        ...facetSpecs(product.value?.facetValues ?? []),
        ...(weight ? [{ label: 'Weight', value: `${weight} kg` }] : []),
    ];
});
const category = computed(
    () =>
        product.value?.facetValues.find(fv => fv.facet.code === 'category')?.name ??
        deepestCollection.value?.name ??
        '',
);
const stockVariantLabel = computed(() => stockVariantFromLevel(variant.value?.stockLevel));

async function fetchData(slug: string) {
    loading.value = true;
    error.value = null;
    try {
        const detailRes = await shopApi(ProductDetailDocument, { slug });
        product.value = detailRes.product ?? null;
    } catch (e) {
        error.value = describeLoadError(e);
    } finally {
        loading.value = false;
    }
}

watch(
    () => route.params.slug,
    slug => {
        if (slug) fetchData(slug as string);
    },
);
onMounted(() => {
    fetchData(route.params.slug as string);
    catalogStore.loadCollections();
});
</script>

<template>
    <main class="product-page">
        <ProductSkeleton v-if="loading" />
        <MvErrorState
            v-else-if="error"
            :title="error.title"
            :message="error.message"
            @retry="fetchData(route.params.slug as string)"
        />
        <MvNotice v-else-if="!product" variant="error">Товар не найден</MvNotice>

        <template v-else>
            <MvBreadcrumbs class="product-page__crumbs" :items="breadcrumbItems" />

            <div class="product-page__layout">
                <MvProductGallery
                    class="product-page__gallery"
                    :product-name="product.name"
                    :images="galleryImages"
                />

                <MvProductMainCards
                    :name="product.name"
                    :sku="variant?.sku ?? ''"
                    :description="product.description"
                    :brand="brand"
                    :category="category"
                    :full-name="product.customFields?.fullName ?? ''"
                    :multiplicity="variant?.customFields?.multiplicity ?? 1"
                    :extra-specs="extraSpecs"
                    :stock-variant-label="stockVariantLabel"
                    :related="[]"
                />

                <ProductBuyPanel
                    class="product-page__side"
                    :price="
                        variant?.customerPrice != null ? variant.customerPrice / 100 : undefined
                    "
                    :compare-at-price="
                        variant?.compareAtPrice != null ? variant.compareAtPrice / 100 : undefined
                    "
                    :currency="variant?.currencyCode ?? 'RUB'"
                    :stock-level="variant?.stockLevel"
                    :show-prices="authStore.isLoggedIn"
                    :cart-qty="cartLineFor(variant?.id)?.quantity ?? 0"
                    :cart-line-id="cartLineFor(variant?.id)?.id"
                    @add-to-cart="onAddToCart(variant?.id)"
                    @update-cart-qty="onUpdateQty"
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

.product-page__crumbs {
    margin-bottom: 20px;
}

.product-page__layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) 300px;
    gap: 20px;
    align-items: start;
}

.product-page__gallery {
    position: sticky;
    top: 92px;
}
.product-page__side {
    position: sticky;
    top: 92px;
}

@media (max-width: 1200px) {
    .product-page__layout {
        grid-template-columns: 240px minmax(0, 1fr) 270px;
    }
}
@media (max-width: 960px) {
    .product-page__layout {
        grid-template-columns: 1fr;
    }
    .product-page__gallery,
    .product-page__side {
        position: static;
    }
}
@media (max-width: 640px) {
    .product-page {
        padding-left: 16px;
        padding-right: 16px;
    }
}
</style>
