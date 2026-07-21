<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { MvButton, MvFilterChips, useLatestRequest, type FilterChip } from '@mivend/ui-kit';
import CustomerDiscountsDataTable from './CustomerDiscountsDataTable.vue';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import { useAuthStore } from '../../stores/auth';
import {
    fetchDiscountGrantsPage,
    fetchDiscountGrantViewCounts,
    DEFAULT_DISCOUNT_GRANT_FILTERS,
    DISCOUNT_GRANT_STATUS_BADGE_VARIANT,
    type DiscountRuleItem,
    type DiscountGrantViewCounts,
} from '../../api/customers';

// Server-side paginated + filtered (AGENTS.md "Pagination" rule) — owns its own fetching, same
// shape as CustomerPaymentsTab.vue. This list previously had no pagination at all under a claim
// of being "genuinely bounded" — wrong: nothing removes an expired grant, so it accumulates one
// row per approved renewal over the customer's whole lifetime, same growth pattern as
// orders/invoices/payments (see DiscountGrantService.findForCounterparty's doc comment).
const props = defineProps<{ counterpartyId: string }>();
const router = useRouter();
const authStore = useAuthStore();

const pageSize = ref(20);
const page = ref(1);
const totalItems = ref(0);
const discounts = ref<DiscountRuleItem[]>([]);

const statusFilter = ref('');
const searchFilter = ref('');

// variant reuses DISCOUNT_GRANT_STATUS_BADGE_VARIANT — the same map the Status column's row
// badge draws from — so the chip and its row badge can never drift into different colors (see
// MvFilterChips' own doc comment). Only 3 real statuses here, so unlike Payments no curation is
// needed — every DISCOUNT_GRANT_STATUS_OPTIONS value gets a chip.
type ViewKey = 'all' | 'active' | 'expiring-soon' | 'expired';
const VIEWS: { key: ViewKey; label: string; variant?: FilterChip['variant'] }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active', variant: DISCOUNT_GRANT_STATUS_BADGE_VARIANT.active },
    { key: 'expiring-soon', label: 'Expiring soon', variant: DISCOUNT_GRANT_STATUS_BADGE_VARIANT['expiring-soon'] },
    { key: 'expired', label: 'Expired', variant: DISCOUNT_GRANT_STATUS_BADGE_VARIANT.expired },
];
const viewCounts = ref<DiscountGrantViewCounts>({ all: 0, active: 0, expiringSoon: 0, expired: 0 });
const VIEW_COUNT_KEY: Record<ViewKey, keyof DiscountGrantViewCounts> = {
    all: 'all',
    active: 'active',
    'expiring-soon': 'expiringSoon',
    expired: 'expired',
};
const viewChips = computed<FilterChip[]>(() =>
    VIEWS.map(v => ({
        key: v.key,
        label: `${v.label} ${viewCounts.value[VIEW_COUNT_KEY[v.key]]}`,
        variant: v.variant,
    })),
);
const activeView = computed<ViewKey>({
    get: () => (statusFilter.value || 'all') as ViewKey,
    set: view => {
        statusFilter.value = view === 'all' ? '' : view;
    },
});

interface DiscountUrlFilters {
    [key: string]: string;
    status: string;
    search: string;
    pageSize: string;
}
const URL_FILTER_DEFAULTS: DiscountUrlFilters = { status: '', search: '', pageSize: '20' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_FILTER_DEFAULTS);

function buildUrlFilters(): DiscountUrlFilters {
    return { status: statusFilter.value, search: searchFilter.value, pageSize: String(pageSize.value) };
}

{
    const parsed = { ...URL_FILTER_DEFAULTS };
    fromQuery(parsed, page);
    if (parsed.status) statusFilter.value = parsed.status;
    if (parsed.search) searchFilter.value = parsed.search;
    if (parsed.pageSize) pageSize.value = Number(parsed.pageSize);
}

const { loading, run: load } = useLatestRequest(
    () =>
        fetchDiscountGrantsPage(
            props.counterpartyId,
            { ...DEFAULT_DISCOUNT_GRANT_FILTERS, status: statusFilter.value, search: searchFilter.value },
            page.value,
            pageSize.value,
        ),
    result => {
        discounts.value = result.items;
        totalItems.value = result.totalItems;
    },
);

async function loadCounts(): Promise<void> {
    viewCounts.value = await fetchDiscountGrantViewCounts(props.counterpartyId);
}

watch([statusFilter, searchFilter, pageSize], () => {
    page.value = 1;
});
watch([page, statusFilter, searchFilter, pageSize], () => {
    void load();
    toQuery(buildUrlFilters(), page);
});

function onDataTableFilters(filters: { status: string; search: string }): void {
    statusFilter.value = filters.status;
    searchFilter.value = filters.search;
}

function goToDiscounts(): void {
    router.push('/discounts');
}

onMounted(() => {
    void load();
    void loadCounts();
});
</script>

<template>
    <CustomerDiscountsDataTable
        :discounts="discounts"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        :page-size="pageSize"
        :status-filter="statusFilter"
        :search-filter="searchFilter"
        :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        @update:filters="onDataTableFilters"
        @update:page="page = $event"
        @update:page-size="pageSize = $event"
        @reset-page="page = 1"
    >
        <template #view-chips>
            <MvFilterChips :chips="viewChips" :active="activeView" @select="activeView = $event as ViewKey" />
        </template>
        <template #toolbar-end>
            <MvButton size="sm" @click="goToDiscounts">New discount grant</MvButton>
        </template>
    </CustomerDiscountsDataTable>
</template>
