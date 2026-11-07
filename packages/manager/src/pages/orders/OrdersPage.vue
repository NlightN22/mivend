<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useDepartmentName } from '../../composables/useDepartmentName';
import OrdersList from '../../components/orders/OrdersList.vue';

const authStore = useAuthStore();
const departmentName = useDepartmentName();
</script>

<template>
    <div class="orders-page">
        <div class="orders-page__header">
            <div>
                <div class="orders-page__breadcrumb">Workspace / Orders</div>
                <h1 class="orders-page__title">Orders</h1>
            </div>
            <div class="orders-page__context">
                <MvStatusBadge variant="info">{{
                    authStore.roleLabel ?? authStore.roleCode
                }}</MvStatusBadge>
                <MvStatusBadge v-if="departmentName" variant="neutral">{{
                    departmentName
                }}</MvStatusBadge>
            </div>
        </div>

        <OrdersList />
    </div>
</template>

<style scoped>
.orders-page__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 14px;
}

.orders-page__context {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.orders-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.orders-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .orders-page__breadcrumb,
    .orders-page__context {
        display: none;
    }

    .orders-page__title {
        font-size: 22px;
    }
}
</style>
