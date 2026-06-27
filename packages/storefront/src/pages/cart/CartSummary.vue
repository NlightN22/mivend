<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCartStore } from '../../stores/cart';

const router = useRouter();

const cartStore = useCartStore();

const subtotal = computed(() =>
    new Intl.NumberFormat('ru-RU').format((cartStore.order?.subTotalWithTax ?? 0) / 100) + ' ₽',
);

const total = computed(() =>
    new Intl.NumberFormat('ru-RU').format(cartStore.totalPrice) + ' ₽',
);

const totalQty = computed(() => cartStore.itemCount);
const lineCount = computed(() => cartStore.lines.length);
</script>

<template>
  <aside class="cart-summary">
    <section class="cart-summary__card">
      <button class="cart-summary__checkout" type="button" @click="router.push('/checkout')">
        Proceed to checkout
      </button>

      <p class="cart-summary__help">
        Delivery method and order comment are selected at the next step.
      </p>

      <div class="cart-summary__title-row">
        <div class="cart-summary__title">Your cart</div>
        <div class="cart-summary__count">{{ lineCount }} items · {{ totalQty }} pcs.</div>
      </div>

      <div class="cart-summary__lines">
        <div class="cart-summary__line">
          <span>Subtotal</span>
          <strong>{{ subtotal }}</strong>
        </div>
        <div class="cart-summary__line cart-summary__line--discount">
          <span>Customer discount</span>
          <strong>— 0 ₽</strong>
        </div>
        <div class="cart-summary__line">
          <span>Expected reserve</span>
          <strong>after ERP</strong>
        </div>
      </div>

      <div class="cart-summary__total">
        <span>Total</span>
        <strong>{{ total }}</strong>
      </div>
    </section>

    <a class="cart-summary__side-card" href="#">
      <div class="cart-summary__side-icon cart-summary__side-icon--green">✓</div>
      <div>
        <div class="cart-summary__side-title">Pre-order checks</div>
        <div class="cart-summary__side-text">Price, stock, multiplicity, limits and contract</div>
      </div>
      <div class="cart-summary__arrow">›</div>
    </a>

    <a class="cart-summary__side-card cart-summary__side-card--orange" href="#">
      <div class="cart-summary__side-icon cart-summary__side-icon--orange">↻</div>
      <div>
        <div class="cart-summary__side-title">Repeat last order</div>
        <div class="cart-summary__side-text">Quickly add regular items to cart</div>
      </div>
      <div class="cart-summary__arrow">›</div>
    </a>
  </aside>
</template>

<style scoped>
.cart-summary { display: grid; gap: 14px; }

.cart-summary__card {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 24px;
}

.cart-summary__checkout {
  width: 100%; min-height: 56px; border: none; border-radius: 18px;
  background: #00a878; color: #fff;
  font-size: 16px; font-weight: 800; font-family: inherit;
  cursor: pointer; margin-bottom: 16px; transition: background 0.15s;
}
.cart-summary__checkout:hover { background: #008a64; }

.cart-summary__help {
  margin: 0 0 18px; color: #66736e; font-size: 13px; line-height: 1.45;
  padding-bottom: 18px; border-bottom: 1px solid #edf2ef;
}

.cart-summary__title-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin: 0 0 16px;
}
.cart-summary__title { font-size: 21px; font-weight: 950; letter-spacing: -0.035em; }
.cart-summary__count { color: #66736e; font-size: 13px; font-weight: 850; }

.cart-summary__lines {
  display: grid; gap: 12px;
  padding-bottom: 16px; border-bottom: 1px solid #edf2ef;
}
.cart-summary__line {
  display: flex; justify-content: space-between; gap: 16px;
  font-size: 14px; line-height: 1.3;
}
.cart-summary__line span { color: #53645e; }
.cart-summary__line strong { white-space: nowrap; color: #2c3b36; }
.cart-summary__line--discount strong { color: #e40066; }

.cart-summary__total {
  margin-top: 18px;
  display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
}
.cart-summary__total span { font-size: 20px; font-weight: 950; letter-spacing: -0.04em; }
.cart-summary__total strong { color: #008a64; font-size: 27px; font-weight: 950; letter-spacing: -0.045em; white-space: nowrap; }

.cart-summary__side-card {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 20px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  min-height: 78px; padding: 16px 18px;
  display: grid; grid-template-columns: 44px minmax(0, 1fr) 18px;
  gap: 12px; align-items: center;
  text-decoration: none; color: inherit;
  transition: box-shadow 0.15s;
}
.cart-summary__side-card:hover { box-shadow: 0 18px 40px rgba(27, 45, 38, 0.12); }

.cart-summary__side-icon {
  width: 44px; height: 44px; border-radius: 15px;
  display: grid; place-items: center;
  font-size: 20px; font-weight: 900;
}
.cart-summary__side-icon--green { background: #e2f8ef; color: #008a64; }
.cart-summary__side-icon--orange { background: #fff1df; color: #ff8a00; }

.cart-summary__side-title { margin-bottom: 3px; font-weight: 900; line-height: 1.2; font-size: 14px; }
.cart-summary__side-text { color: #66736e; font-size: 13px; line-height: 1.35; }
.cart-summary__arrow { color: #a0aca7; font-size: 24px; font-weight: 600; }
</style>
