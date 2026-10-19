<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatDate, formatMoney } from '../../i18n/format';

type OrderAction = 'open' | 'repeat' | 'documents';
type OrderStatus = 'awaitingErp' | 'reserveConfirmed' | 'shipped';

const { t } = useI18n();

const demoOrders: {
    number: string;
    date: () => string;
    address: string;
    amount: number;
    status: OrderStatus;
    statusType: string;
    items: number;
    actions: OrderAction[];
}[] = [
    {
        number: '348921',
        date: () => t('account.recentOrders.today', { time: '14:28' }),
        address: 'North Hwy, 12',
        amount: 42860,
        status: 'awaitingErp',
        statusType: 'warning',
        items: 7,
        actions: ['open', 'repeat'],
    },
    {
        number: '348744',
        date: () => t('account.recentOrders.yesterday', { time: '17:12' }),
        address: 'Mira St, 85',
        amount: 18940,
        status: 'reserveConfirmed',
        statusType: 'success',
        items: 4,
        actions: ['open', 'documents'],
    },
    {
        number: '348510',
        date: () => formatDate('2026-06-24', { day: 'numeric', month: 'short' }),
        address: 'North Hwy, 12',
        amount: 96300,
        status: 'shipped',
        statusType: 'muted',
        items: 18,
        actions: ['open', 'repeat'],
    },
];

const orders = computed(() =>
    demoOrders.map(order => ({
        ...order,
        date: order.date(),
        amount: formatMoney(order.amount),
    })),
);
</script>

<template>
    <div class="recent-orders">
        <div class="recent-orders__header">
            <div>
                <h2 class="recent-orders__title">{{ $t('account.recentOrders.title') }}</h2>
                <div class="recent-orders__subtitle">
                    {{ $t('account.recentOrders.subtitle') }}
                </div>
            </div>
            <RouterLink to="/orders" class="recent-orders__link-more">{{
                $t('account.recentOrders.all')
            }}</RouterLink>
        </div>

        <div class="recent-orders__scroll">
            <div class="recent-orders__list">
                <div v-for="order in orders" :key="order.number" class="recent-orders__row">
                    <div class="recent-orders__cell recent-orders__cell--main">
                        <div class="recent-orders__number">
                            {{ $t('account.recentOrders.order', { number: order.number }) }}
                        </div>
                        <div class="recent-orders__meta recent-orders__meta--truncate">
                            {{ order.date }} · {{ order.address }}
                        </div>
                    </div>
                    <div class="recent-orders__cell recent-orders__amount">{{ order.amount }}</div>
                    <div class="recent-orders__cell">
                        <span
                            class="recent-orders__pill"
                            :class="`recent-orders__pill--${order.statusType}`"
                        >
                            {{ $t(`account.recentOrders.status.${order.status}`) }}
                        </span>
                    </div>
                    <div class="recent-orders__cell recent-orders__meta">
                        {{ $t('account.recentOrders.items', order.items) }}
                    </div>
                    <div class="recent-orders__cell recent-orders__actions">
                        <button
                            v-for="action in order.actions"
                            :key="action"
                            class="recent-orders__btn"
                            :class="{ 'recent-orders__btn--primary': action === 'open' }"
                        >
                            {{ $t(`account.recentOrders.action.${action}`) }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.recent-orders {
    background: #fff;
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    border: 1px solid rgba(221, 231, 226, 0.86);
    padding: 22px;
    margin-bottom: 22px;
}

.recent-orders__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
}

.recent-orders__title {
    margin: 0 0 5px;
    font-size: 26px;
    letter-spacing: -0.045em;
}

.recent-orders__subtitle {
    color: #66736e;
    font-size: 14px;
    line-height: 1.45;
}

.recent-orders__link-more {
    color: #008a64;
    font-weight: 950;
    font-size: 14px;
    white-space: nowrap;
    text-decoration: none;
}

.recent-orders__scroll {
    overflow-x: auto;
}

.recent-orders__list {
    display: grid;
    gap: 10px;
    min-width: 720px;
}

.recent-orders__row {
    min-height: 76px;
    display: grid;
    grid-template-columns: minmax(180px, 1.1fr) 120px 160px 100px 180px;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border: 1px solid #edf2ef;
    border-radius: 18px;
    background: #fbfdfc;
}

.recent-orders__cell {
    min-width: 0;
}

.recent-orders__number {
    font-weight: 950;
    margin-bottom: 4px;
    letter-spacing: -0.02em;
}

.recent-orders__meta {
    color: #66736e;
    font-size: 13px;
    line-height: 1.32;
}

.recent-orders__meta--truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.recent-orders__amount {
    font-size: 18px;
    font-weight: 950;
    letter-spacing: -0.035em;
}

.recent-orders__pill {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 950;
    white-space: nowrap;
}

.recent-orders__pill--success {
    background: #e2f8ef;
    color: #008a64;
}
.recent-orders__pill--muted {
    background: #eef4f1;
    color: #5f6e68;
}
.recent-orders__pill--warning {
    background: #fff4e3;
    color: #a45e00;
}

.recent-orders__actions {
    display: flex;
    justify-content: flex-start;
    gap: 8px;
}

.recent-orders__btn {
    border: 0;
    min-height: 38px;
    min-width: 86px;
    border-radius: 12px;
    padding: 0 13px;
    background: #f3f8f6;
    color: #263732;
    font-weight: 950;
    font-size: 13px;
    white-space: nowrap;
    text-align: center;
    cursor: pointer;
    font: inherit;
}

.recent-orders__btn--primary {
    background: #00a878;
    color: #fff;
}
</style>
