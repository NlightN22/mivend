<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
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
}

const props = withDefaults(defineProps<Props>(), {
    price: undefined,
    compareAtPrice: undefined,
    currency: 'RUB',
    stockLevel: undefined,
    cartQty: 0,
    cartLineId: undefined,
    salesUnit: null,
});

const { t, n } = useI18n();
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
        ? t('product.perPiece', {
              price: n(props.price, { style: 'currency', currency: props.currency }),
          })
        : null,
);
const stepperValue = computed(() =>
    props.salesUnit ? baseToPacks(props.cartQty, props.salesUnit) : props.cartQty,
);
const addQty = computed(() =>
    props.salesUnit ? packsToBase(props.salesUnit.packStep, props.salesUnit) : 1,
);

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
                class="buy-panel__price"
            />
            <div v-if="showPrices && salesUnit && price !== undefined" class="buy-panel__unit-note">
                {{ t('product.perUnit', { unit: salesUnit.name }) }} · {{ perPieceNote }}
                <br />
                {{ t('product.packSize', { size: salesUnit.ratio }) }}
            </div>
            <div v-else-if="!showPrices" class="buy-panel__price-hint">Log in to see prices</div>
            <div v-else class="buy-panel__price buy-panel__price--on-request">Price on request</div>

            <div class="buy-panel__price-note">Price includes customer terms and VAT.</div>

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
.buy-panel__unit-note {
    font-size: 13px;
    color: #5b6b66;
    margin-bottom: 6px;
}
.buy-panel__price-note {
    font-size: 12px;
    color: #a8b8b2;
    margin-bottom: 16px;
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
