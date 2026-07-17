<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { shopApi } from '../../api/client';
import { MyAdvanceBalanceDocument } from '../../api/generated/graphql';
import { useInvoices } from '../invoices/useInvoices';

const authStore = useAuthStore();

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

// Real payment obligations now live entirely on /invoices (which can independently span
// several of our organizations per split order — see docs/payments.md "Organizations") — this
// sidebar only surfaces an honest summary and links there, rather than duplicating a
// pay-anything widget with no real backing.
const { invoices, load: loadInvoices } = useInvoices();
const advanceBalances = ref<{ amount: number; currencyCode: string }[]>([]);

function formatMoney(cents: number, currency: string): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(cents / 100)
        + ' ' + (currency === 'RUB' ? '₽' : currency);
}

const unpaidTotal = computed(() => {
    const byCurrency = new Map<string, number>();
    for (const invoice of invoices.value) {
        if (invoice.status === 'paid' || invoice.status === 'cancelled') continue;
        byCurrency.set(invoice.currencyCode, (byCurrency.get(invoice.currencyCode) ?? 0) + invoice.amount);
    }
    return [...byCurrency.entries()].map(([currency, amount]) => formatMoney(amount, currency)).join(', ') || '0 ₽';
});

const advanceTotal = computed(() =>
    advanceBalances.value.map(a => formatMoney(a.amount, a.currencyCode)).join(', '),
);

onMounted(async () => {
    void loadInvoices({ take: 200, skip: 0 });
    const result = await shopApi(MyAdvanceBalanceDocument, {});
    advanceBalances.value = result.myAdvanceBalance;
});
</script>

<template>
    <aside class="orders-aside">
        <div class="aside-card">
            <div class="aside-title">Payments &amp; invoices</div>
            <div class="aside-subtitle">Every order can split into several invoices (one per organization) — pay any of them any time from the Invoices page.</div>
            <router-link to="/invoices" class="wide-btn orange">Go to invoices</router-link>
        </div>

        <div class="aside-card">
            <div class="aside-title">Balance &amp; limits</div>
            <div class="aside-line"><span>Available limit</span><strong>{{ availableLimit }}</strong></div>
            <div class="aside-line"><span>Payment delay</span><strong>{{ paymentDelay }}</strong></div>
            <div class="aside-line"><span>Unpaid (all invoices)</span><strong>{{ unpaidTotal }}</strong></div>
            <div v-if="advanceBalances.length" class="aside-line"><span>Advance balance</span><strong>{{ advanceTotal }}</strong></div>
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
    margin-bottom: 14px;
}

.wide-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 48px;
    border: 0;
    border-radius: 16px;
    background: #00a878;
    color: #fff;
    font-weight: 950;
    font-family: inherit;
    font-size: 15px;
    text-decoration: none;
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
