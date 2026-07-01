<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AccountSidebar from '../account/AccountSidebar.vue';
import OrderCard from './OrderCard.vue';
import OrdersAside from './OrdersAside.vue';
import { useOrders } from './useOrders';
import type { ErpStatus } from './useOrders';

const { orders, loading, load } = useOrders();

const activeFilter = ref('all');
const searchQuery = ref('');

const FILTER_GROUPS: Record<string, ErpStatus[]> = {
    pending:   ['PENDING', 'SENT_TO_ERP', 'RESERVED'],
    confirmed: ['CONFIRMED', 'ASSEMBLED'],
    in_transit: ['SHIPPED'],
    closed:    ['DELIVERED', 'CANCELLED'],
};

const filters = [
    { key: 'all',        label: 'All orders' },
    { key: 'pending',    label: 'In progress' },
    { key: 'confirmed',  label: 'Confirmed' },
    { key: 'in_transit', label: 'Shipped' },
    { key: 'closed',     label: 'Closed' },
];

const filteredOrders = computed(() => {
    let result = orders.value;

    if (activeFilter.value !== 'all') {
        const allowed = FILTER_GROUPS[activeFilter.value] ?? [];
        result = result.filter(o => {
            const s = o.customFields.erpStatus ?? 'PENDING';
            return allowed.includes(s as ErpStatus);
        });
    }

    if (searchQuery.value.trim()) {
        const q = searchQuery.value.toLowerCase();
        result = result.filter(o =>
            o.code.toLowerCase().includes(q) ||
            o.lines.some(l => l.productVariant.product.name.toLowerCase().includes(q)) ||
            (o.shippingAddress?.streetLine1?.toLowerCase().includes(q) ?? false),
        );
    }

    return result;
});

onMounted(() => { void load(); });
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

            <div v-if="loading" class="orders-state">Loading orders...</div>

            <div v-else-if="filteredOrders.length === 0" class="orders-state">
                No orders found.
            </div>

            <div v-else class="orders-page-grid">
                <div class="orders-page-list">
                    <OrderCard v-for="order in filteredOrders" :key="order.id" :order="order" />
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

.orders-state {
    color: #66736e;
    font-size: 14px;
    padding: 32px 0;
    text-align: center;
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
