<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { MvErrorState, MvSkeleton } from '@mivend/ui-kit';
import { useOrders } from '../orders/useOrders';
import { useOrderStatusesStore } from '../../stores/orderStatuses';
import { describeLoadError } from '../../api/describeLoadError';
import AccountRecentOrderRow from './AccountRecentOrderRow.vue';

const RECENT_ORDERS_COUNT = 5;

const { orders, loading, error, load } = useOrders();
const statuses = useOrderStatusesStore();
const errorText = computed(() => (error.value ? describeLoadError(error.value) : null));

function reload(): void {
    void load({ take: RECENT_ORDERS_COUNT, skip: 0 });
}

onMounted(() => {
    void statuses.load();
    reload();
});
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

        <div v-if="loading && !orders.length" class="recent-orders__list">
            <MvSkeleton v-for="n in 3" :key="n" height="76px" radius="18px" />
        </div>
        <MvErrorState
            v-else-if="errorText"
            :title="errorText.title"
            :message="errorText.message"
            :retry-label="$t('common.retry')"
            @retry="reload"
        />
        <div v-else-if="!orders.length" class="recent-orders__empty">
            {{ $t('account.recentOrders.empty') }}
        </div>
        <div v-else class="recent-orders__scroll">
            <div class="recent-orders__list recent-orders__list--rows">
                <AccountRecentOrderRow v-for="order in orders" :key="order.id" :order="order" />
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
}

.recent-orders__list--rows {
    min-width: 720px;
}

.recent-orders__empty {
    padding: 22px 16px;
    border: 1px dashed #dde7e2;
    border-radius: 18px;
    color: #66736e;
    font-size: 14px;
    text-align: center;
}
</style>
