<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useCartStore } from '../../stores/cart';

const router = useRouter();
const cartStore = useCartStore();

async function choose(status: 'success' | 'pending' | 'fail'): Promise<void> {
    await cartStore.completeOnlinePayment(status);
    router.push(`/payment-result?status=${status}`);
}
</script>

<template>
  <div class="stub-page">
    <div class="stub-card">
      <div class="stub-lock">🔒</div>
      <h1 class="stub-title">Payment</h1>
      <p class="stub-subtitle">Demo payment service — for testing only</p>

      <div class="stub-warning">
        ⚠️ This is a stub page. In production this will be replaced by a real payment provider redirect.
      </div>

      <div class="stub-order">Order #348744 · 12 450 ₽</div>

      <div class="stub-actions">
        <button class="stub-btn stub-btn--green" @click="choose('success')">✓ Payment successful</button>
        <button class="stub-btn stub-btn--orange" @click="choose('pending')">⏳ Payment pending</button>
        <button class="stub-btn stub-btn--red" @click="choose('fail')">✕ Payment failed</button>
      </div>

      <RouterLink to="/checkout" class="stub-back">← Back to checkout</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.stub-page {
  min-height: 100vh;
  background: #f4f7f5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.stub-card {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 24px;
  padding: 36px 32px 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.10);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.stub-lock {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #e2f8ef;
  display: grid;
  place-items: center;
  font-size: 28px;
  margin-bottom: 14px;
}

.stub-title {
  margin: 0 0 6px;
  font-size: 28px;
  font-weight: 950;
  letter-spacing: -0.045em;
}

.stub-subtitle {
  margin: 0 0 20px;
  color: #66736e;
  font-size: 14px;
}

.stub-warning {
  width: 100%;
  background: #fff8e0;
  border: 1px solid #ffe082;
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 13px;
  color: #7a5500;
  margin-bottom: 18px;
  text-align: left;
}

.stub-order {
  font-size: 15px;
  font-weight: 800;
  color: #263732;
  background: #f4faf7;
  border: 1px solid #dde7e2;
  border-radius: 12px;
  padding: 10px 18px;
  margin-bottom: 22px;
  width: 100%;
}

.stub-actions {
  display: grid;
  gap: 10px;
  width: 100%;
  margin-bottom: 18px;
}

.stub-btn {
  width: 100%;
  min-height: 52px;
  border: 0;
  border-radius: 16px;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  color: #fff;
  cursor: pointer;
  transition: opacity 0.15s;
}
.stub-btn:hover { opacity: 0.88; }

.stub-btn--green { background: #00a878; box-shadow: 0 8px 20px rgba(0,168,120,0.22); }
.stub-btn--orange { background: #ff8a00; box-shadow: 0 8px 20px rgba(255,138,0,0.22); }
.stub-btn--red { background: #d92d20; box-shadow: 0 8px 20px rgba(217,45,32,0.18); }

.stub-back {
  font-size: 13px;
  color: #66736e;
  text-decoration: none;
  font-weight: 700;
}
.stub-back:hover { color: #263732; }
</style>
