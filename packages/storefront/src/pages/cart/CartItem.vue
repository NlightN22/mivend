<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { IconPackage } from '@tabler/icons-vue';
import { MvFavoriteButton, MvStatusBadge, MvTooltip, stockVariantFromLevel } from '@mivend/ui-kit';
import { assetUrl } from '../../composables/assetUrl';
import { useFavoritesStore } from '../../stores/favorites';
import { useCartStore, type CartLine } from '../../stores/cart';
import CartLinePrice from '../../components/CartLinePrice.vue';
import { brandOf } from '../../utils/brand';
import { usePackagesOnly } from '../../composables/usePackagesOnly';
import {
    baseToPacks,
    nearestPackOf,
    packsToBase,
    salesUnitOf,
} from '../../composables/useSalesUnit';
import { formatTierValue } from '../../utils/discount';
import { discountLineReason, discountTierReachedReason } from '../../utils/discountMessages';

const props = defineProps<{ line: CartLine; checked: boolean }>();
const emit = defineEmits<{ 'update:checked': [value: boolean] }>();

const cartStore = useCartStore();
const favoritesStore = useFavoritesStore();
const { packagesOnly, load: loadPackagesOnly } = usePackagesOnly();
void loadPackagesOnly();
const salesUnit = computed(() =>
    salesUnitOf(props.line.productVariant.customFields, packagesOnly.value),
);
const stepperQty = computed(() =>
    salesUnit.value ? baseToPacks(qty.value, salesUnit.value) : qty.value,
);
const packInfo = computed(() =>
    nearestPackOf(
        props.line.productVariant.customFields,
        props.line.productVariant.product.packagingLevels,
    ),
);
const isFavorited = computed(() => favoritesStore.has(props.line.productVariant.id));
function toggleFavorite(): void {
    favoritesStore.toggle(props.line.productVariant.id, props.line.productVariant.product.id);
}
const qty = ref(props.line.quantity);
const confirmingRemove = ref(false);

watch(
    () => props.line.quantity,
    v => {
        qty.value = v;
    },
);

const brand = computed(() => brandOf(props.line.productVariant.product.manufacturer));

const totalWeightKg = computed(() => {
    const weight = props.line.productVariant.customFields?.weight;
    return weight != null ? weight * props.line.quantity : null;
});

const discountPercent = computed(() => {
    const { unitPrice, compareAtPrice } = props.line;
    if (compareAtPrice == null || unitPrice == null) return null;
    const percent = Math.round((1 - unitPrice / compareAtPrice) * 100);
    return percent > 0 ? percent : null;
});

const discountReason = computed(() => {
    const tp = props.line.tierProgress;
    if (tp?.currentPercent) {
        return discountTierReachedReason(
            tp.facetName,
            formatTierValue(tp.current, tp.metric),
            tp.currentPercent,
        );
    }
    if (!brand.value || discountPercent.value == null) return null;
    return discountLineReason(brand.value, discountPercent.value);
});

const stockVariant = computed(() => stockVariantFromLevel(props.line.productVariant.stockLevel));

async function onQtyChange(newQty: number): Promise<void> {
    if (newQty === 0) {
        confirmingRemove.value = true;
        return;
    }
    const baseQty = salesUnit.value ? packsToBase(newQty, salesUnit.value) : newQty;
    qty.value = baseQty;
    await cartStore.adjustItem(props.line.id, baseQty);
}

async function confirmRemove(): Promise<void> {
    confirmingRemove.value = false;
    await cartStore.removeItem(props.line.id);
}

function cancelRemove(): void {
    confirmingRemove.value = false;
}
</script>

<template>
    <article class="cart-item">
        <MvCheckbox
            class="cart-item__check"
            :model-value="checked"
            @update:model-value="(value: boolean) => emit('update:checked', value)"
        />

        <div class="cart-item__img">
            <img
                v-if="line.featuredAsset"
                :src="assetUrl(line.featuredAsset.preview, 'thumb')"
                :alt="line.productVariant.product.name"
                loading="lazy"
            />
            <IconPackage v-else :size="32" stroke-width="1.6" aria-hidden="true" />
        </div>

        <div class="cart-item__info">
            <RouterLink
                :to="`/product/${line.productVariant.product.slug}`"
                class="cart-item__name"
            >
                {{ line.productVariant.product.name }}
            </RouterLink>
            <div class="cart-item__meta">
                <span>SKU {{ line.productVariant.sku }}</span>
                <span v-if="brand">{{ brand }}</span>
                <span v-if="totalWeightKg != null">{{ totalWeightKg.toLocaleString() }} kg</span>
                <span v-if="packInfo">Pack {{ packInfo.baseQty }} pcs.</span>
            </div>
            <div class="cart-item__pills">
                <MvStockBadge :variant="stockVariant" />
                <MvStatusBadge
                    v-if="line.productVariant.availableForOrder === false"
                    variant="danger"
                >
                    Not available for order
                </MvStatusBadge>
            </div>
            <div class="cart-item__links">
                <MvFavoriteButton :is-favorited="isFavorited" @toggle="toggleFavorite" />
                <MvTooltip placement="bottom">
                    <template #trigger>
                        <MvButton variant="subtle" size="sm">Analogs</MvButton>
                    </template>
                    Analogs are not available yet. Coming later.
                </MvTooltip>
            </div>
        </div>

        <div class="cart-item__unit">
            <MvTooltip v-if="discountPercent && discountReason" placement="bottom">
                <template #trigger>
                    <button type="button" class="cart-item__price-trigger">
                        <CartLinePrice
                            :line="line"
                            :currency="line.productVariant.currencyCode"
                            kind="unit"
                            :unit-factor="salesUnit?.ratio ?? 1"
                        />
                    </button>
                </template>
                <div>{{ discountReason }}</div>
            </MvTooltip>
            <CartLinePrice
                v-else
                :line="line"
                :currency="line.productVariant.currencyCode"
                kind="unit"
                :unit-factor="salesUnit?.ratio ?? 1"
            />
        </div>

        <div class="cart-item__qty">
            <div v-if="confirmingRemove" class="cart-item__remove-confirm">
                <span>Remove?</span>
                <MvButton
                    class="cart-item__remove-confirm-yes"
                    variant="danger"
                    size="sm"
                    @click="confirmRemove"
                    >Yes</MvButton
                >
                <MvButton
                    class="cart-item__remove-confirm-no"
                    variant="secondary"
                    size="sm"
                    @click="cancelRemove"
                    >No</MvButton
                >
            </div>
            <MvQtyStepper
                v-else
                editable
                :model-value="stepperQty"
                :min="0"
                :step="salesUnit?.packStep ?? 1"
                @update:model-value="onQtyChange"
            />
            <div v-if="salesUnit && !confirmingRemove" class="cart-item__qty-note">
                {{ salesUnit.name }}, {{ line.quantity }} pcs. total
            </div>
        </div>

        <div class="cart-item__total">
            <CartLinePrice :line="line" :currency="line.productVariant.currencyCode" kind="total" />
        </div>
    </article>
</template>

<style scoped>
.cart-item {
    display: grid;
    grid-template-columns: 28px 96px minmax(0, 1fr) 112px 150px 120px;
    gap: 14px;
    align-items: center;
    padding: 18px 0;
    border-bottom: 1px solid #edf2ef;
}
.cart-item__qty-note {
    margin-top: 4px;
    font-size: 12px;
    color: #66736e;
}
.cart-item:last-child {
    border-bottom: none;
}

.cart-item__check {
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: #00a878;
}

.cart-item__img {
    width: 96px;
    height: 96px;
    border-radius: 18px;
    background: linear-gradient(145deg, #f7fbfa, #ebf8f2);
    border: 1px solid #edf2ef;
    display: grid;
    place-items: center;
    color: #8fb5a6;
    overflow: hidden;
}
.cart-item__img img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 18px;
}

.cart-item__info {
    min-width: 0;
}

.cart-item__name {
    display: block;
    font-size: 15px;
    font-weight: 850;
    line-height: 1.35;
    color: #17231f;
    text-decoration: none;
    margin-bottom: 8px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}
.cart-item__name:hover {
    color: #00a878;
}

.cart-item__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
    color: #66736e;
    font-size: 12px;
    font-weight: 800;
}

.cart-item__pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
}

.cart-item__links {
    display: flex;
    align-items: center;
    gap: 12px;
}

.cart-item__unit,
.cart-item__total {
    white-space: nowrap;
}
.cart-item__price-trigger {
    border: none;
    background: transparent;
    padding: 0;
    margin: 0;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    display: inline-flex;
}

.cart-item__remove-confirm {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 800;
    color: #66736e;
}
@media (max-width: 900px) {
    .cart-item {
        grid-template-columns: 28px 72px minmax(0, 1fr) auto;
        row-gap: 10px;
    }
    .cart-item__img {
        width: 72px;
        height: 72px;
    }
    .cart-item__info {
        grid-column: 3 / -1;
    }
    .cart-item__unit {
        grid-column: 3;
        grid-row: 2;
    }
    .cart-item__total {
        grid-column: 4;
        grid-row: 2;
    }
    .cart-item__qty {
        grid-column: 1 / -1;
    }
}
</style>
