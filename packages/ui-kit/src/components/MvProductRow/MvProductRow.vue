<script setup lang="ts">
import { computed } from 'vue';
import MvAmountDisplay from '../MvAmountDisplay/MvAmountDisplay.vue';
import MvStockBadge from '../MvStockBadge/MvStockBadge.vue';
import {
    type StockBadgeLabels,
    type StockVariant,
    stockVariantFromQuantity,
} from '../MvStockBadge/stock-variant';
import { IconInfoCircle } from '@tabler/icons-vue';
import MvQtyStepper, { type QtyStepperLabels } from '../MvQtyStepper/MvQtyStepper.vue';
import MvTooltip from '../MvTooltip/MvTooltip.vue';
import MvFavoriteButton from '../MvFavoriteButton/MvFavoriteButton.vue';
import MvDiscountBadge, { type DiscountTier } from '../MvDiscountBadge/MvDiscountBadge.vue';
import MvProgressBar from '../MvProgressBar/MvProgressBar.vue';

export interface ProductRowLabels {
    sku: string;
    stock: string;
    unit: string;
    defaultUnit: string;
    multiplicity: string;
    multiplicityPieces: (multiplicity: number) => string;
    pack: string;
    price: string;
    logIn: string;
    floorPrice: string;
    add: string;
    analogs: string;
    favorite: string;
}

const DEFAULT_LABELS: ProductRowLabels = {
    sku: 'SKU',
    stock: 'Stock',
    unit: 'Unit',
    defaultUnit: 'pc.',
    multiplicity: 'Multiplicity',
    multiplicityPieces: (multiplicity: number) => `${multiplicity} pcs.`,
    pack: 'Pack',
    price: 'Price',
    logIn: 'Log in',
    floorPrice: 'Floor price',
    add: '+ Add',
    analogs: 'Analogs',
    favorite: 'Toggle favorite',
};

interface Props {
    name: string;
    sku: string;
    brand?: string;
    imageUrl?: string;
    price?: number;
    customerPrice?: number;
    oldPrice?: number;
    // Staff-only: showFloorPrice is a per-list permission so the column stays aligned across rows.
    showFloorPrice?: boolean;
    floorPrice?: number;
    discountTiers?: DiscountTier[];
    tierProgress?: {
        label: string;
        value: number;
        max: number;
        variant?: 'normal' | 'warn';
    } | null;
    discountTitle?: string;
    discountWeightLabel?: (kg: number) => string;
    discountAmountLabel?: (minorUnits: number) => string;
    currency?: string;
    stock?: number;
    stockVariant?: StockVariant;
    multiplicity?: number;
    // Unit the price is for ('pc.', 'pack'); empty hides it. Pack mode also changes the stepper step.
    unitLabel?: string;
    unitNote?: string;
    multiplicityLabel?: string;
    // false hides the Multiplicity cell and its grid track (branch does not enforce multiplicity).
    showMultiplicity?: boolean;
    // Text for a Pack cell that takes the Multiplicity slot when it is hidden; undefined omits it.
    packLabel?: string;
    qtyStep?: number;
    slug?: string;
    showPrices?: boolean;
    variantId?: string;
    cartQty?: number;
    cartLineId?: string;
    isFavorited?: boolean;
    linkBase?: string;
    showFavorite?: boolean;
    // false hides the stepper/add/analogs area for view-only consumers.
    showActions?: boolean;
    labels?: Partial<ProductRowLabels>;
    stockLabels?: Partial<StockBadgeLabels>;
    stepperLabels?: Partial<QtyStepperLabels>;
}

const props = withDefaults(defineProps<Props>(), {
    brand: '',
    price: undefined,
    customerPrice: undefined,
    oldPrice: undefined,
    showFloorPrice: false,
    floorPrice: undefined,
    discountTiers: () => [],
    tierProgress: null,
    currency: 'RUB',
    stock: undefined,
    stockVariant: undefined,
    multiplicity: 1,
    unitLabel: '',
    unitNote: '',
    multiplicityLabel: '',
    showMultiplicity: true,
    packLabel: undefined,
    qtyStep: 1,
    slug: '',
    showPrices: true,
    variantId: undefined,
    cartQty: 0,
    cartLineId: undefined,
    isFavorited: false,
    linkBase: '/product',
    showFavorite: true,
    showActions: true,
    labels: () => ({}),
    stockLabels: () => ({}),
    stepperLabels: () => ({}),
});

const text = computed<ProductRowLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }));

const emit = defineEmits<{
    'add-to-cart': [variantId: string | undefined];
    'update-cart-qty': [lineId: string, qty: number];
    'toggle-favorite': [variantId: string | undefined];
    'view-analogs': [];
}>();

const effectiveStockVariant = computed(
    (): StockVariant =>
        props.stock !== undefined
            ? stockVariantFromQuantity(props.stock)
            : (props.stockVariant ?? 'out'),
);

const showPack = computed(() => !props.showMultiplicity && props.packLabel !== undefined);

const canOrder = computed(() => effectiveStockVariant.value !== 'out');

function onStepperChange(qty: number): void {
    if (props.cartLineId) emit('update-cart-qty', props.cartLineId, qty);
}
</script>

<template>
    <article
        class="mv-product-row"
        :class="{
            'mv-product-row--with-floor-price': showFloorPrice,
            'mv-product-row--no-multiplicity': !showMultiplicity && !showPack,
        }"
    >
        <div class="mv-product-row__media">
            <div class="mv-product-row__img-wrap">
                <slot name="image">
                    <img
                        v-if="imageUrl"
                        class="mv-product-row__img-photo"
                        :src="imageUrl"
                        :alt="name"
                        loading="lazy"
                    />
                    <div v-else class="mv-product-row__img-placeholder">&#9744;</div>
                </slot>
            </div>
        </div>

        <div class="mv-product-row__main">
            <RouterLink v-if="slug" :to="`${linkBase}/${slug}`" class="mv-product-row__name">{{
                name
            }}</RouterLink>
            <span v-else class="mv-product-row__name mv-product-row__name--plain">{{ name }}</span>
            <div class="mv-product-row__brand-row">
                <span v-if="brand" class="mv-product-row__brand">{{ brand }}</span>
                <MvDiscountBadge
                    v-if="discountTiers.length > 0"
                    size="sm"
                    :tiers="discountTiers"
                    :title="discountTitle"
                    :weight-label="discountWeightLabel"
                    :amount-label="discountAmountLabel"
                />
            </div>
            <MvProgressBar
                v-if="tierProgress"
                class="mv-product-row__tier-progress"
                :label="tierProgress.label"
                :value="tierProgress.value"
                :max="tierProgress.max"
                :variant="tierProgress.variant"
            />
        </div>

        <div class="mv-product-row__cell">
            <div class="mv-product-row__cell-label">{{ text.sku }}</div>
            <div class="mv-product-row__cell-value mv-product-row__sku">{{ sku }}</div>
        </div>

        <div class="mv-product-row__cell">
            <div class="mv-product-row__cell-label">{{ text.stock }}</div>
            <MvStockBadge :labels="stockLabels" v-if="stock !== undefined" :quantity="stock" />
            <MvStockBadge :labels="stockLabels" v-else-if="stockVariant" :variant="stockVariant" />
            <span v-else class="mv-product-row__stock-none">—</span>
        </div>

        <div class="mv-product-row__cell">
            <div class="mv-product-row__cell-label">{{ text.unit }}</div>
            <div class="mv-product-row__cell-value mv-product-row__unit-value">
                {{ unitLabel || text.defaultUnit }}
                <MvTooltip v-if="unitNote" placement="top" trigger="hover">
                    <template #trigger>
                        <IconInfoCircle :size="14" class="mv-product-row__unit-info" />
                    </template>
                    {{ unitNote }}
                </MvTooltip>
            </div>
        </div>

        <div v-if="showMultiplicity" class="mv-product-row__cell">
            <div class="mv-product-row__cell-label">{{ text.multiplicity }}</div>
            <div class="mv-product-row__cell-value">
                {{
                    multiplicityLabel ||
                    (multiplicity > 1 ? text.multiplicityPieces(multiplicity) : '—')
                }}
            </div>
        </div>

        <div v-if="showPack" class="mv-product-row__cell">
            <div class="mv-product-row__cell-label">{{ text.pack }}</div>
            <div class="mv-product-row__cell-value">{{ packLabel || '—' }}</div>
        </div>

        <div class="mv-product-row__cell">
            <div class="mv-product-row__cell-label">{{ text.price }}</div>
            <template v-if="showPrices && (price !== undefined || customerPrice !== undefined)">
                <MvAmountDisplay
                    v-if="customerPrice !== undefined"
                    :amount="customerPrice"
                    :currency="currency"
                    size="sm"
                    class="mv-product-row__price mv-product-row__price--customer"
                />
                <MvAmountDisplay
                    v-if="oldPrice !== undefined"
                    :amount="oldPrice"
                    :currency="currency"
                    size="sm"
                    class="mv-product-row__old-price"
                />
                <MvAmountDisplay
                    v-if="customerPrice === undefined && price !== undefined"
                    :amount="price"
                    :currency="currency"
                    size="sm"
                    class="mv-product-row__price"
                />
            </template>
            <div v-if="!showPrices" class="mv-product-row__price-hint">{{ text.logIn }}</div>
            <div
                v-else-if="price === undefined && customerPrice === undefined"
                class="mv-product-row__price-hint"
            >
                —
            </div>
        </div>

        <div v-if="showFloorPrice" class="mv-product-row__cell">
            <div class="mv-product-row__cell-label">{{ text.floorPrice }}</div>
            <MvAmountDisplay
                v-if="floorPrice !== undefined"
                :amount="floorPrice"
                :currency="currency"
                size="sm"
                class="mv-product-row__floor-price"
            />
            <span v-else class="mv-product-row__price-hint">—</span>
        </div>

        <div v-if="showFavorite || showActions" class="mv-product-row__actions">
            <MvFavoriteButton
                v-if="showFavorite"
                class="mv-product-row__fav"
                :is-favorited="isFavorited"
                :aria-label="text.favorite"
                @toggle="emit('toggle-favorite', variantId)"
            />
            <div v-if="showActions" class="mv-product-row__control">
                <slot name="actions">
                    <template v-if="canOrder">
                        <MvQtyStepper
                            v-if="cartQty > 0"
                            :model-value="cartQty"
                            :min="0"
                            :step="qtyStep"
                            editable
                            size="sm"
                            :labels="stepperLabels"
                            @update:model-value="onStepperChange"
                        />
                        <button
                            v-else
                            class="mv-product-row__add-btn"
                            type="button"
                            :disabled="!showPrices"
                            @click="emit('add-to-cart', variantId)"
                        >
                            {{ text.add }}
                        </button>
                    </template>
                    <template v-else>
                        <button
                            class="mv-product-row__analog-btn"
                            type="button"
                            @click="emit('view-analogs')"
                        >
                            {{ text.analogs }}
                        </button>
                    </template>
                </slot>
            </div>
        </div>
    </article>
</template>

<style scoped>
.mv-product-row {
    display: grid;
    grid-template-columns: 64px minmax(160px, 1fr) 120px 100px 80px 90px 110px 140px;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #edf3f0;
    background: #fff;
    transition: background 0.1s;
}
.mv-product-row:hover {
    background: #f7fbfa;
}

/* Extra track for the staff-only "Floor price" cell — see hasFloorPrice/props.floorPrice. */
.mv-product-row--with-floor-price {
    grid-template-columns: 64px minmax(160px, 1fr) 120px 100px 80px 90px 110px 110px 140px;
}

.mv-product-row--no-multiplicity {
    grid-template-columns: 64px minmax(160px, 1fr) 120px 100px 80px 110px 140px;
}
.mv-product-row--no-multiplicity.mv-product-row--with-floor-price {
    grid-template-columns: 64px minmax(160px, 1fr) 120px 100px 80px 110px 110px 140px;
}

.mv-product-row__media {
    display: flex;
    align-items: center;
    justify-content: center;
}
.mv-product-row__img-wrap {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    overflow: hidden;
    background: #f4f9f7;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.mv-product-row__img-photo {
    width: 100%;
    height: 100%;
    object-fit: contain;
}
.mv-product-row__img-placeholder {
    font-size: 22px;
    color: #b4ccc4;
}

.mv-product-row__main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0 12px;
    min-width: 0;
}
.mv-product-row__name {
    font-size: 14px;
    font-weight: 700;
    color: #14231f;
    text-decoration: none;
    line-height: 1.3;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}
.mv-product-row__name--plain {
    cursor: default;
}
.mv-product-row__name:not(.mv-product-row__name--plain):hover {
    color: #00b894;
}
.mv-product-row__brand-row {
    display: flex;
    align-items: center;
    gap: 6px;
}
.mv-product-row__brand {
    font-size: 12px;
    font-weight: 700;
    color: #66736e;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.mv-product-row__cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 8px;
}
.mv-product-row__cell-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #a8b8b2;
}
.mv-product-row__cell-value {
    font-size: 13px;
    color: #2c3b36;
}
.mv-product-row__sku {
    font-family: monospace;
    font-size: 12px;
    color: #2c3b36;
}
.mv-product-row__stock-none {
    font-size: 13px;
    color: #b4ccc4;
}

.mv-product-row__price {
    font-weight: 900;
    letter-spacing: -0.02em;
}
.mv-product-row__unit-value {
    display: flex;
    align-items: center;
    gap: 4px;
}
.mv-product-row__unit-info {
    color: #8fa39b;
    cursor: help;
}
.mv-product-row__unit {
    font-size: 12px;
    color: #66736e;
}
.mv-product-row__price--customer {
    color: #00a878;
}
.mv-product-row__old-price {
    font-size: 12px !important;
    color: #a8b8b2;
    text-decoration: line-through;
}
.mv-product-row__price-hint {
    font-size: 12px;
    color: #a8b8b2;
}
.mv-product-row__floor-price {
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #66736e;
}

.mv-product-row__actions {
    display: grid;
    grid-template-columns: 28px 1fr;
    align-items: center;
    gap: 8px;
    padding: 0 0 0 8px;
}

.mv-product-row__fav {
    justify-self: start;
}
.mv-product-row__control {
    display: flex;
    justify-content: flex-end;
}

.mv-product-row__qty {
    display: flex;
    align-items: center;
    border: 1.5px solid #dde7e2;
    border-radius: 10px;
    overflow: hidden;
    height: 36px;
}
.mv-product-row__qty-btn {
    width: 30px;
    height: 100%;
    border: none;
    background: transparent;
    font-size: 18px;
    color: #2c3b36;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s;
}
.mv-product-row__qty-btn:hover {
    background: #e8f5f0;
}
.mv-product-row__qty-val {
    min-width: 32px;
    text-align: center;
    font-size: 14px;
    font-weight: 700;
    color: #14231f;
}

.mv-product-row__add-btn {
    height: 36px;
    padding: 0 14px;
    border: none;
    border-radius: 10px;
    background: var(--app-accent-orange, #ff8a00);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: background 0.15s;
    flex-shrink: 0;
    white-space: nowrap;
    font-family: inherit;
}
.mv-product-row__add-btn:hover:not(:disabled) {
    background: #e67a00;
}
.mv-product-row__add-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.mv-product-row__analog-btn {
    width: 100%;
    height: 36px;
    border: 1.5px solid #dde7e2;
    border-radius: 10px;
    background: transparent;
    color: #66736e;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition:
        border-color 0.15s,
        color 0.15s;
}
.mv-product-row__analog-btn:hover {
    border-color: #00b894;
    color: #00b894;
}
.mv-product-row__tier-progress {
    margin-top: 6px;
}
</style>
