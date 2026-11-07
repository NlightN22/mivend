<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MvFilterChips, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useOrderStatusesStore } from '../../stores/orderStatuses';
import { useOrdersList } from '../../composables/useOrdersList';
import { useOrdersViewCounts } from '../../composables/useOrdersViewCounts';
import {
    BLANK_ORDERS_FILTERS,
    ORDERS_VIEWS,
    ORDERS_VIEW_VARIANT,
    type OrdersListFilters,
    type OrdersView,
} from '../../api/orders-list';
import OrdersListTable from './OrdersListTable.vue';
import OrderQuickPanel from './OrderQuickPanel.vue';
import { toOrderRows, type OrderListRow } from './ordersListRows';

// `customerId` is a preset: it narrows the list, is never shown as a filter, and the server
// scopes the result exactly as it does the unfiltered list.
const props = defineProps<{ customerId?: string }>();

const router = useRouter();
const authStore = useAuthStore();
const statuses = useOrderStatusesStore();
void statuses.load();

const list = useOrdersList({ customerId: props.customerId });
const viewCounts = useOrdersViewCounts(props.customerId, list.filters);

// Manager sees only their own customers, so a manager column and filter would be redundant.
const showManagerColumn = computed(() => authStore.roleCode !== 'manager');

const rows = computed(() =>
    toOrderRows(list.items.value, {
        managers: list.managers.value,
        branches: list.branches.value,
        isRejected: code => statuses.isRejected(code),
        pendingApprovalOrderIds: viewCounts.pendingApprovalOrderIds.value,
    }),
);

const chips = computed<FilterChip[]>(() =>
    ORDERS_VIEWS.map(v => ({
        key: v.key,
        label: v.label,
        variant: ORDERS_VIEW_VARIANT[v.key],
        count: viewCounts.counts.value?.[v.key],
        emphasis: v.key === 'awaiting-confirmation',
    })),
);

const selected = ref<OrderListRow | null>(null);

function selectView(view: string): void {
    list.filters.value = { ...list.filters.value, view: view as OrdersView };
}
function clearFilters(): void {
    list.filters.value = { ...BLANK_ORDERS_FILTERS };
}
function applyFilters(next: OrdersListFilters): void {
    list.filters.value = next;
}
defineExpose({ filters: list.filters, applyFilters });

function openOrder(code: string): void {
    void router.push(`/orders/${code}`);
}
</script>

<template>
    <OrdersListTable
        :rows="rows"
        :loading="list.loading.value"
        :failed="list.failed.value"
        :total-items="list.totalItems.value"
        :page="list.page.value"
        :page-size="list.pageSize.value"
        :filters="list.filters.value"
        :sort="list.sort.value"
        :managers="list.managers.value"
        :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        :show-manager-column="showManagerColumn"
        :customer-preset="Boolean(customerId)"
        @update:filters="list.filters.value = $event"
        @update:sort="list.sort.value = $event"
        @update:page="list.page.value = $event"
        @update:page-size="list.pageSize.value = $event"
        @clear-filters="clearFilters"
        @retry="list.reload"
        @row-click="selected = $event"
    >
        <template #view-chips>
            <MvFilterChips
                scrollable
                :chips="chips"
                :active="list.filters.value.view"
                @select="selectView"
            />
        </template>
    </OrdersListTable>
    <OrderQuickPanel v-if="selected" :row="selected" @close="selected = null" @open="openOrder" />
</template>
