<script setup lang="ts">
import { computed } from 'vue';
import { IconPackage } from '@tabler/icons-vue';
import CartLinePrice from '../../components/CartLinePrice.vue';
import { assetUrl } from '../../composables/assetUrl';
import { brandOf } from '../../utils/brand';
import { useCartStore, type CartLine } from '../../stores/cart';

const cartStore = useCartStore();

function getBrand(line: CartLine): string {
    return brandOf(line.productVariant.product.manufacturer);
}

const lineCount = computed(() => cartStore.lines.length);
const totalQty = computed(() => cartStore.totalQuantity);
</script>

<template>
    <article class="checkout-items">
        <div class="checkout-items__head">
            <div>
                <h2 class="checkout-items__title">Your order</h2>
                <p class="checkout-items__subtitle">{{ lineCount }} items · {{ totalQty }} pcs.</p>
            </div>
            <RouterLink class="checkout-items__edit-btn" to="/cart">Edit</RouterLink>
        </div>

        <div class="checkout-items__list">
            <div v-for="line in cartStore.lines" :key="line.id" class="checkout-items__row">
                <div class="checkout-items__img">
                    <img
                        v-if="line.featuredAsset"
                        :src="assetUrl(line.featuredAsset.preview, 'thumb')"
                        :alt="line.productVariant.product.name"
                        loading="lazy"
                    />
                    <IconPackage v-else :size="24" stroke-width="1.6" aria-hidden="true" />
                </div>
                <div class="checkout-items__info">
                    <div class="checkout-items__name">{{ line.productVariant.product.name }}</div>
                    <div class="checkout-items__meta">
                        {{ getBrand(line) ? getBrand(line) + ' · ' : '' }}{{ line.quantity }} pcs. ·
                        {{ line.productVariant.sku }}
                    </div>
                </div>
                <div class="checkout-items__prices">
                    <CartLinePrice
                        :line="line"
                        :currency="line.productVariant.currencyCode"
                        kind="unit"
                    />
                    <CartLinePrice
                        :line="line"
                        :currency="line.productVariant.currencyCode"
                        kind="total"
                    />
                </div>
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
    display: inline-flex;
    align-items: center;
    text-decoration: none;
}

.checkout-items__list {
    display: grid;
    gap: 8px;
}

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
    color: #66736e;
    overflow: hidden;
}

.checkout-items__img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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

.checkout-items__prices {
    display: flex;
    gap: 20px;
}

@media (max-width: 900px) {
    .checkout-items__row {
        grid-template-columns: 52px minmax(0, 1fr);
    }
    .checkout-items__prices {
        grid-column: 2;
    }
}
</style>
