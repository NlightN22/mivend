<script setup lang="ts">
import { computed } from 'vue';
import { stockVariantFromLevel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';

interface Props {
    price?: number;
    compareAtPrice?: number;
    currency?: string;
    stockLevel?: string;
    showPrices: boolean;
    cartQty?: number;
    cartLineId?: string;
}

const props = withDefaults(defineProps<Props>(), {
    price: undefined,
    compareAtPrice: undefined,
    currency: 'RUB',
    stockLevel: undefined,
    cartQty: 0,
    cartLineId: undefined,
});

const emit = defineEmits<{ 'add-to-cart': []; 'update-cart-qty': [lineId: string, qty: number] }>();

const authStore = useAuthStore();

const counterparty = computed(() => authStore.counterparty);
const availableCredit = computed(() => {
    if (!counterparty.value) return null;
    return (counterparty.value.creditLimit - counterparty.value.creditBalance) / 100;
});
const formatRub = (n: number) =>
    new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0,
    }).format(n);

const stockVariant = computed(() => stockVariantFromLevel(props.stockLevel));
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
                v-if="showPrices && price !== undefined"
                :amount="price"
                :currency="currency ?? 'RUB'"
                size="lg"
                class="buy-panel__price"
            />
            <div v-else-if="!showPrices" class="buy-panel__price-hint">Log in to see prices</div>
            <div v-else class="buy-panel__price">—</div>

            <div class="buy-panel__price-note">Price includes customer terms and VAT.</div>

            <MvQtyStepper
                v-if="cartQty > 0"
                :model-value="cartQty"
                :min="0"
                block
                @update:model-value="
                    (val: number) => cartLineId && emit('update-cart-qty', cartLineId, val)
                "
            />
            <button
                v-else
                class="buy-panel__add"
                type="button"
                :disabled="!showPrices || stockVariant === 'out'"
                @click="emit('add-to-cart')"
            >
                Add to cart
            </button>
        </div>

        <div
            v-if="authStore.isLoggedIn && availableCredit !== null && availableCredit > 0"
            class="buy-panel__notice buy-panel__notice--green"
        >
            <span>✓</span>
            <div>
                <strong>Can be ordered without upfront payment.</strong>
                Available credit: {{ formatRub(availableCredit) }}. Payment terms:
                {{ counterparty!.paymentDelayDays }} days.
            </div>
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

.buy-panel__notice {
    border-radius: 16px;
    padding: 14px 16px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 13px;
    background: #f0faf6;
    border: 1px solid #b6e8d4;
    color: #1a5c40;
}
.buy-panel__notice--green span {
    font-size: 16px;
    color: #00a873;
    flex-shrink: 0;
    margin-top: 1px;
}
.buy-panel__notice strong {
    display: block;
    margin-bottom: 2px;
}
</style>
