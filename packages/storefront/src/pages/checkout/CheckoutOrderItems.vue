<script setup lang="ts">
import { computed } from 'vue';
import { useCartStore, type CartLine } from '../../stores/cart';

const cartStore = useCartStore();

function getBrand(line: CartLine): string {
    const bv = line.productVariant.product.facetValues.find((fv) => fv.facet.code === 'brand');
    return bv?.name ?? '';
}

function formatPrice(kobo: number): string {
    return new Intl.NumberFormat('ru-RU').format(kobo / 100) + ' ₽';
}

const lineCount = computed(() => cartStore.lines.length);
const totalQty = computed(() => cartStore.itemCount);
</script>

<template>
    <article class="checkout-items">
        <div class="checkout-items__head">
            <div>
                <h2 class="checkout-items__title">Your order</h2>
                <p class="checkout-items__subtitle">{{ lineCount }} items · {{ totalQty }} pcs.</p>
            </div>
            <button class="checkout-items__edit-btn" type="button">Edit</button>
        </div>

        <div class="checkout-items__list">
            <div v-for="line in cartStore.lines" :key="line.id" class="checkout-items__row">
                <div class="checkout-items__img">🔧</div>
                <div class="checkout-items__info">
                    <div class="checkout-items__name">{{ line.productVariant.product.name }}</div>
                    <div class="checkout-items__meta">
                        {{ getBrand(line) ? getBrand(line) + ' · ' : '' }}{{ line.quantity }} pcs. · {{ line.productVariant.sku }}
                    </div>
                </div>
                <div class="checkout-items__sum">{{ formatPrice(line.linePriceWithTax) }}</div>
            </div>
        </div>
    </article>
</template>

<style scoped>
.checkout-items {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 22px;
}

.checkout-items__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 16px;
}

.checkout-items__title {
    margin: 0 0 5px;
    font-size: 24px;
    letter-spacing: -0.045em;
}

.checkout-items__subtitle {
    margin: 0;
    color: #66736e;
    font-size: 14px;
}

.checkout-items__edit-btn {
    border: 0;
    min-height: 40px;
    border-radius: 13px;
    padding: 0 14px;
    background: #f3f8f6;
    color: #263732;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    font: inherit;
    flex: 0 0 auto;
}

.checkout-items__list { display: grid; gap: 8px; }

.checkout-items__row {
    min-height: 68px;
    padding: 10px 12px;
    border: 1px solid #edf2ef;
    border-radius: 18px;
    background: #fbfdfc;
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
}

.checkout-items__img {
    width: 52px;
    height: 52px;
    border-radius: 15px;
    display: grid;
    place-items: center;
    background: #fff;
    border: 1px solid #edf2ef;
    font-size: 25px;
}

.checkout-items__name {
    font-weight: 800;
    line-height: 1.25;
    margin-bottom: 4px;
    font-size: 14px;
}

.checkout-items__meta {
    color: #66736e;
    font-size: 12px;
    font-weight: 700;
}

.checkout-items__sum {
    font-weight: 800;
    white-space: nowrap;
    font-size: 14px;
}

@media (max-width: 900px) {
    .checkout-items__row { grid-template-columns: 52px minmax(0, 1fr); }
    .checkout-items__sum { grid-column: 2; }
}
</style>
