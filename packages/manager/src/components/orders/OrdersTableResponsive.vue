<script setup lang="ts">
import { useIsMobileViewport } from '@mivend/ui-kit';
import OrdersTable from './OrdersTable.vue';
import OrdersDataTable from './OrdersDataTable.vue';
import type { OrderListItem, ManagerOption, BranchOption, OrderSortField } from '../../api/orders';

// Breakpoint switch: mobile keeps the existing card-list rendering (OrdersTable.vue → MvTable's
// own mobile branch — reused as-is, not duplicated); desktop/tablet now renders the new
// PrimeVue-based OrdersDataTable.vue. See OrdersDataTable.vue's doc comment for why sort/filter
// there is scoped to columns Vendure already supports server-side.
defineProps<{
    orders: OrderListItem[];
    managers: ManagerOption[];
    branches: BranchOption[];
    showManagerColumn: boolean;
    pendingApprovalOrderIds: Set<string>;
    loading: boolean;
    totalItems: number;
    pageSize: number;
    stateFilter: string;
    administratorId: string;
}>();

const emit = defineEmits<{
    'update:sort': [sort: Partial<Record<OrderSortField, 'ASC' | 'DESC'>>];
    'update:state-filter': [value: string];
}>();

const isMobile = useIsMobileViewport(800);
</script>

<template>
    <OrdersTable
        v-if="isMobile"
        :orders="orders"
        :managers="managers"
        :branches="branches"
        :show-manager-column="showManagerColumn"
        :pending-approval-order-ids="pendingApprovalOrderIds"
        :page-size="pageSize"
    />
    <OrdersDataTable
        v-else
        :orders="orders"
        :managers="managers"
        :branches="branches"
        :show-manager-column="showManagerColumn"
        :pending-approval-order-ids="pendingApprovalOrderIds"
        :loading="loading"
        :total-items="totalItems"
        :page-size="pageSize"
        :state-filter="stateFilter"
        :administrator-id="administratorId"
        @update:sort="emit('update:sort', $event)"
        @update:state-filter="emit('update:state-filter', $event)"
    />
</template>
