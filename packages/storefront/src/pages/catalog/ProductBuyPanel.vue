<script setup lang="ts">
import { computed } from 'vue';
import { stockVariantFromLevel } from '@mivend/ui-kit';
import { baseToPacks, packsToBase, type SalesUnitView } from '../../composables/useSalesUnit';

interface Props {
    price?: number;
    compareAtPrice?: number;
    currency?: string;
    stockLevel?: string;
    showPrices: boolean;
    cartQty?: number;
    cartLineId?: string;
    salesUnit?: SalesUnitView | null;
    nearestPack?: { name: string; ratio: number } | null;
}

const props = withDefaults(defineProps<Props>(), {
    price: undefined,
    compareAtPrice: undefined,
    currency: 'RUB',
    stockLevel: undefined,
    cartQty: 0,
    cartLineId: undefined,
    salesUnit: null,
    nearestPack: null,
});

const emit = defineEmits<{
    'add-to-cart': [qty: number];
    'update-cart-qty': [lineId: string, qty: number];
}>();

const stockVariant = computed(() => stockVariantFromLevel(props.stockLevel));
const unitPrice = computed(() =>
    props.price !== undefined && props.salesUnit
        ? props.price * props.salesUnit.ratio
        : props.price,
);
const perPieceNote = computed(() =>
    props.price !== undefined && props.salesUnit
        ? `${new Intl.NumberFormat('ru-RU', { style: 'currency', currency: props.currency }).format(props.price)} per pc.`
        : null,
);
const stepperValue = computed(() =>
    props.salesUnit ? baseToPacks(props.cartQty, props.salesUnit) : props.cartQty,
);
const addQty = computed(() =>
    props.salesUnit ? packsToBase(props.salesUnit.packStep, props.salesUnit) : 1,
);

function onAddPack(): void {
    if (!props.nearestPack) return;
    if (props.cartQty > 0 && props.cartLineId) {
        emit('update-cart-qty', props.cartLineId, props.cartQty + props.nearestPack.ratio);
    } else {
        emit('add-to-cart', props.nearestPack.ratio);
    }
}

function onStepper(lineId: string | undefined, value: number): void {
    if (!lineId) return;
    emit('update-cart-qty', lineId, props.salesUnit ? packsToBase(value, props.salesUnit) : value);
}
</script>

<template>
    <div class="buy-panel">
        <div class="buy-panel__card">
            <MvAmountDisplay
                v-if="showPrices && compareAtPrice !== undefined"
                :amount="compareAtPrice"
                :currency="currency ?? 'RUB'"
                size="sm"
                class="buy-panel__compare-at-price"
            />
            <MvAmountDisplay
                v-if="showPrices && unitPrice !== undefined"
                :amount="unitPrice"
                :currency="currency ?? 'RUB'"
                size="lg"
                :decimals="Number.isInteger(unitPrice) ? 0 : 2"
                class="buy-panel__price"
            />
            <div v-else-if="!showPrices" class="buy-panel__price-hint">Log in to see prices</div>
            <div v-else class="buy-panel__price buy-panel__price--on-request">Price on request</div>
            <div class="buy-panel__price-note">
                <template v-if="showPrices && salesUnit && price !== undefined">
                    Price per {{ salesUnit.name }} · {{ perPieceNote }}<br />
                </template>
                Price includes customer terms and VAT.
            </div>

            <MvButton
                v-if="showPrices && nearestPack"
                variant="secondary"
                size="sm"
                class="buy-panel__add-pack"
                @click="onAddPack"
            >
                Add {{ nearestPack.name }} (+{{ nearestPack.ratio }} pc.)
            </MvButton>

            <MvQtyStepper
                v-if="cartQty > 0"
                :model-value="stepperValue"
                :min="0"
                :step="salesUnit?.packStep ?? 1"
                block
                @update:model-value="(val: number) => onStepper(cartLineId, val)"
            />
            <RouterLink
                v-else-if="showPrices && price === undefined"
                to="/requests"
                class="buy-panel__add buy-panel__add--link"
            >
                Request price
            </RouterLink>
            <button
                v-else
                class="buy-panel__add"
                type="button"
                :disabled="!showPrices || stockVariant === 'out'"
                @click="emit('add-to-cart', addQty)"
            >
                Add to cart
            </button>
        </div>
    </div>
</template>

<style scoped>
.buy-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.buy-panel__card {
    background: #fff;
    border-radius: 20px;
    border: 1px solid rgba(221, 231, 226, 0.86);
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 20px;
}

.buy-panel__compare-at-price {
    font-size: 14px !important;
    color: #a8b8b2;
    text-decoration: line-through;
    margin-bottom: 2px;
}
.buy-panel__price {
    display: block;
    font-size: 32px;
    font-weight: 900;
    letter-spacing: -0.04em;
    color: #14231f;
    line-height: 1;
    margin-bottom: 6px;
}
.buy-panel__price--on-request {
    font-size: 22px;
    letter-spacing: -0.02em;
    margin-bottom: 10px;
}
.buy-panel__add--link {
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
}
.buy-panel__price-hint {
    font-size: 14px;
    color: #a8b8b2;
    margin-bottom: 6px;
}
.buy-panel__price-note {
    font-size: 12px;
    color: #a8b8b2;
    margin-bottom: 16px;
}

.buy-panel__add-pack {
    margin-bottom: 10px;
}

.buy-panel__add {
    width: 100%;
    height: 52px;
    border: none;
    border-radius: 14px;
    background: var(--app-accent-orange, #ff8a00);
    color: #fff;
    font-size: 16px;
    font-weight: 800;
    font-family: inherit;
    cursor: pointer;
    margin-bottom: 10px;
    transition: background 0.15s;
}
.buy-panel__add:hover:not(:disabled) {
    background: var(--app-accent-orange-hover, #e67c00);
}
.buy-panel__add:active:not(:disabled) {
    background: var(--app-accent-orange-active, #cc6e00);
}
.buy-panel__add:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
</style>
