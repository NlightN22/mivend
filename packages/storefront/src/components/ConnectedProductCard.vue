<script setup lang="ts">
import { stockVariantFromLevel } from '@mivend/ui-kit';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { useFavoritesStore } from '../stores/favorites';
import { useCartActions } from '../composables/useCartActions';
import { useProductQuantity } from '../composables/useProductQuantity';
import { useProductLabels } from '../composables/useProductLabels';
import { flatPercentOf, useTierProgressView } from '../composables/useTierProgressView';
import { brandOf } from '../utils/brand';
import { formatMoney, formatNumber } from '../i18n/format';
import type { ProductItem } from '../composables/useProductList';

const props = withDefaults(
    defineProps<{
        item: ProductItem;
        mode: 'row' | 'card';
        showPrices?: boolean;
    }>(),
    // undefined keeps the prop unset so Vue does not cast an omitted boolean to false
    { showPrices: undefined },
);

const { t } = useI18n();
const labels = useProductLabels();
const authStore = useAuthStore();
const favoritesStore = useFavoritesStore();
const { cartLineFor, onAddToCart, onUpdateQty } = useCartActions();
const { multiplicityEnforced, unitView, packQty, shownQty, toBaseQty } = useProductQuantity();

const variant = computed(() => props.item.variants[0]);
const tierProgress = useTierProgressView(
    computed(() => variant.value?.id),
    computed(() => flatPercentOf(variant.value?.customerPrice, variant.value?.compareAtPrice)),
);
const prices = computed(() => {
    const factor = unitView(props.item).factor;
    const scale = (v: number | null | undefined): number | undefined =>
        v != null ? Math.round(v * factor) / 100 : undefined;
    return {
        price: scale(variant.value?.price),
        customerPrice: scale(variant.value?.customerPrice),
        compareAt: scale(variant.value?.compareAtPrice),
    };
});
const pricesVisible = computed(() => props.showPrices ?? authStore.isLoggedIn);
const stock = computed(() =>
    authStore.isLoggedIn ? { stockVariant: stockVariantFromLevel(variant.value?.stockLevel) } : {},
);
const packLabelRow = computed(() => {
    if (multiplicityEnforced.value) return undefined;
    const q = packQty(props.item);
    return q ? t('units.pieces', { n: q }) : '—';
});
const packLabelCard = computed(() => {
    const q = packQty(props.item);
    return q ? t('productList.packOf', { n: q }) : '';
});

const common = computed(() => ({
    name: props.item.name,
    sku: variant.value?.sku ?? '',
    brand: brandOf(props.item.manufacturer),
    price: prices.value.price,
    customerPrice: prices.value.customerPrice,
    unitLabel: unitView(props.item).label,
    unitNote: unitView(props.item).note,
    qtyStep: unitView(props.item).step,
    discountTiers: variant.value?.discountTiers,
    discountTitle: t('productCard.volumeDiscount'),
    discountWeightLabel: (kg: number) => t('productCard.weightThreshold', { kg: formatNumber(kg) }),
    discountAmountLabel: (minorUnits: number) =>
        t('productCard.amountThreshold', {
            amount: formatMoney(minorUnits / 100, variant.value?.currencyCode ?? 'RUB'),
        }),
    tierProgress: tierProgress.value,
    stepperLabels: labels.value.stepper,
    stockLabels: labels.value.stock,
    currency: variant.value?.currencyCode ?? 'RUB',
    slug: props.item.slug,
    showPrices: pricesVisible.value,
    variantId: variant.value?.id,
    cartQty: shownQty(props.item),
    cartLineId: cartLineFor(variant.value?.id)?.id,
    isFavorited: favoritesStore.has(variant.value?.id ?? ''),
    ...stock.value,
}));

function add(variantId: string | undefined): void {
    void onAddToCart(variantId, variant.value);
}

function updateQty(lineId: string, qty: number): void {
    void onUpdateQty(lineId, toBaseQty(props.item, qty));
}

function toggleFavorite(): void {
    favoritesStore.toggle(variant.value?.id ?? props.item.id, props.item.id);
}
</script>

<template>
    <MvProductRow
        v-if="mode === 'row'"
        v-bind="common"
        :image-url="item.images[0]"
        :old-price="prices.compareAt"
        :multiplicity="variant?.multiplicity ?? 1"
        :multiplicity-label="unitView(item).multiplicity"
        :show-multiplicity="multiplicityEnforced"
        :pack-label="packLabelRow"
        :labels="labels.row"
        @add-to-cart="add"
        @update-cart-qty="updateQty"
        @toggle-favorite="toggleFavorite"
        @view-analogs="() => {}"
    />
    <MvProductCard
        v-else
        v-bind="common"
        :images="item.images"
        :compare-at-price="prices.compareAt"
        :pack-label="packLabelCard"
        :labels="labels.card"
        @add-to-cart="add"
        @update-cart-qty="updateQty"
        @toggle-favorite="toggleFavorite"
        @view-analogs="() => {}"
    />
</template>
