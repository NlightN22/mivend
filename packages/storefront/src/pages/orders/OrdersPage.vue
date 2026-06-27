<script setup lang="ts">
import { ref } from 'vue';
import AccountSidebar from '../account/AccountSidebar.vue';
import OrderCard, { type OrderData } from './OrderCard.vue';
import OrdersAside from './OrdersAside.vue';

const activeFilter = ref('all');

const filters = [
    { key: 'all', label: 'All orders 8' },
    { key: 'erp', label: 'Awaiting ERP 3' },
    { key: 'assembly', label: 'Assembly 2' },
    { key: 'ready', label: 'Ready to ship 1' },
    { key: 'unpaid', label: 'Unpaid 4' },
    { key: 'closed', label: 'Closed' },
];

const orders: OrderData[] = [
    {
        number: '#348921',
        meta: 'Today, 14:28 · North Highway, 12 · 7 items',
        statusLabel: 'Awaiting ERP',
        statusVariant: 'warning',
        amount: '42 860 ₽',
        debtLabel: 'Balance: 42 860 ₽',
        debtOk: false,
        thumb: '🛢️',
        preview: 'Motor oil, oil filter, antifreeze G11 and 4 more items. Reserve will be confirmed after ERP processing.',
        showPay: true,
        payLabel: 'Pay',
    },
    {
        number: '#348744',
        meta: 'Yesterday, 17:10 · North Highway, 12 · 12 items',
        statusLabel: 'Reserve confirmed',
        statusVariant: 'default',
        amount: '86 420 ₽',
        debtLabel: 'Remaining: 21 420 ₽',
        debtOk: false,
        thumb: '🔧',
        preview: 'Brake pads, spark plugs, wipers and consumables. Partial payment received, remaining balance can be paid separately.',
        showPay: true,
        payLabel: 'Pay balance',
    },
    {
        number: '#347982',
        meta: 'Jun 24 · North Highway, 12 · 5 items',
        statusLabel: 'Shipped',
        statusVariant: 'muted',
        amount: '18 730 ₽',
        debtLabel: 'Paid in full',
        debtOk: true,
        thumb: '📦',
        preview: 'Order shipped. Documents available, items can be re-added to a new cart via repeat order.',
        showPay: false,
        payLabel: '',
    },
    {
        number: '#347611',
        meta: 'Jun 21 · North Highway, 12 · 19 items',
        statusLabel: 'Ready to ship',
        statusVariant: 'default',
        amount: '124 300 ₽',
        debtLabel: 'Balance: 124 300 ₽',
        debtOk: false,
        thumb: '🚚',
        preview: 'Order assembled and awaiting shipment. Delivery to current trading point by default.',
        showPay: true,
        payLabel: 'Pay',
    },
];

const searchQuery = ref('');
</script>

<template>
    <div class="orders-layout">
        <AccountSidebar />

        <section class="orders-content">
            <div class="orders-toolbar">
                <div>
                    <h1 class="orders-title">My Orders</h1>
                    <p class="orders-subtitle">Working order list: statuses, amounts, payment, documents and repeat order.</p>
                </div>
                <input
                    v-model="searchQuery"
                    class="toolbar-search"
                    placeholder="Search by number, product or address"
                />
            </div>

            <div class="filter-chips">
                <button
                    v-for="f in filters"
                    :key="f.key"
                    class="chip"
                    :class="{ active: activeFilter === f.key }"
                    @click="activeFilter = f.key"
                >
                    {{ f.label }}
                </button>
            </div>

            <div class="orders-page-grid">
                <div class="orders-page-list">
                    <OrderCard v-for="order in orders" :key="order.number" :order="order" />
                </div>
                <OrdersAside />
            </div>
        </section>
    </div>
</template>

<style scoped>
.orders-layout {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.orders-content { min-width: 0; }

.orders-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
}

.orders-title {
    margin: 0 0 6px;
    font-size: clamp(32px, 3vw, 44px);
    line-height: 1;
    letter-spacing: -0.055em;
}

.orders-subtitle {
    margin: 0;
    color: #66736e;
    font-size: 14px;
    line-height: 1.45;
}

.toolbar-search {
    width: min(420px, 100%);
    min-height: 46px;
    border: 1px solid #dde7e2;
    border-radius: 16px;
    background: #fff;
    padding: 0 16px;
    font-family: inherit;
    font-size: 14px;
    outline: none;
    flex-shrink: 0;
}

.toolbar-search:focus { border-color: #00a878; }

.filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 18px;
}

.chip {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 13px;
    border-radius: 999px;
    border: 1px solid #dde7e2;
    background: #fff;
    color: #344640;
    font-weight: 850;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    transition: 0.14s ease;
}

.chip:hover { background: #f4faf7; }

.chip.active {
    background: #00a878;
    border-color: #00a878;
    color: #fff;
}

.orders-page-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 330px;
    gap: 22px;
    align-items: start;
}

.orders-page-list {
    display: grid;
    gap: 12px;
}

@media (max-width: 1180px) {
    .orders-page-grid { grid-template-columns: 1fr; }
}

@media (max-width: 960px) {
    .orders-layout { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
    .orders-layout { padding-left: 16px; padding-right: 16px; }
    .orders-toolbar { display: grid; }
    .toolbar-search { width: 100%; }
}
</style>
