<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();

const payAmount = ref('42 860 ₽');

const availableLimit = computed(() => {
    const cp = authStore.counterparty;
    if (!cp) return '—';
    const val = (cp.creditLimit - cp.creditBalance) / 100;
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(val) + ' ₽';
});

const paymentDelay = computed(() => {
    const days = authStore.counterparty?.paymentDelayDays;
    return days != null ? `${days} days` : '—';
});
</script>

<template>
    <aside class="orders-aside">
        <div class="aside-card">
            <div class="aside-title">Payment</div>
            <div class="aside-subtitle">Pay a specific order, a remaining balance, or make an advance payment.</div>
            <input v-model="payAmount" class="pay-input" />
            <button class="wide-btn orange">Proceed to payment</button>
        </div>

        <div class="aside-card">
            <div class="aside-title">Balance &amp; limits</div>
            <div class="aside-line"><span>Available limit</span><strong>{{ availableLimit }}</strong></div>
            <div class="aside-line"><span>Payment delay</span><strong>{{ paymentDelay }}</strong></div>
            <div class="aside-line"><span>Overdue</span><strong>0 ₽</strong></div>
            <div class="aside-line"><span>Unpaid</span><strong>188 580 ₽</strong></div>
        </div>

        <div class="aside-card">
            <div class="aside-title">How we account payments</div>
            <div class="aside-subtitle">
                Payments may be applied as advance. The client sees the balance due and payment history;
                allocation across orders is handled internally.
            </div>
        </div>
    </aside>
</template>

<style scoped>
.orders-aside {
    position: sticky;
    top: 118px;
    display: grid;
    gap: 14px;
}

.aside-card {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.9);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 20px;
}

.aside-title {
    font-size: 18px;
    font-weight: 950;
    letter-spacing: -0.035em;
    margin-bottom: 8px;
}

.aside-subtitle {
    color: #66736e;
    font-size: 13px;
    line-height: 1.45;
    margin-bottom: 4px;
}

.pay-input {
    width: 100%;
    min-height: 48px;
    border: 1px solid #dde7e2;
    border-radius: 15px;
    padding: 0 14px;
    font-weight: 900;
    font-family: inherit;
    font-size: 16px;
    outline: none;
    margin: 10px 0;
}

.pay-input:focus { border-color: #00a878; }

.wide-btn {
    width: 100%;
    min-height: 48px;
    border: 0;
    border-radius: 16px;
    background: #00a878;
    color: #fff;
    font-weight: 950;
    font-family: inherit;
    font-size: 15px;
    cursor: pointer;
    transition: 0.14s ease;
}

.wide-btn:hover { background: #008a64; }
.wide-btn.orange { background: #ff8a00; }
.wide-btn.orange:hover { background: #e87800; }

.aside-line {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 0;
    border-bottom: 1px solid #edf2ef;
    font-size: 14px;
    color: #66736e;
}

.aside-line:last-child { border-bottom: none; }
.aside-line strong { color: #17231f; }

@media (max-width: 1180px) {
    .orders-aside { position: static; }
}
</style>
