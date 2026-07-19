<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { MvPanel, MvPagination, MvTableFilters, deriveFilterSuggestions } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import {
    fetchApprovalsInbox,
    fetchOrderReferences,
    fetchCounterpartyReferencesByErpId,
    type OrderReference,
    type CounterpartyReference,
    type ApprovalListOptions,
} from '../../api/approvals';
import { fetchManagerOptions, type ManagerOption } from '../../api/orders';
import ApprovalsTable from '../../components/approvals/ApprovalsTable.vue';
import { APPROVAL_FILTER_FIELDS, buildApprovalRows } from '../../components/approvals/approvalRows';

const PAGE_SIZE = 10;

const activeTab = ref<'awaiting' | 'all'>('awaiting');
const page = ref(1);
const filterValues = ref<Record<string, string>>({});

const rows = ref<TableRow[]>([]);
const totalItems = ref(0);
const awaitingBadgeCount = ref(0);
const managers = ref<ManagerOption[]>([]);
const loading = ref(true);

function resetFilters(): void {
    filterValues.value = {};
}

function buildOptions(forActiveTab: boolean): ApprovalListOptions {
    if (!forActiveTab) return { take: 0 };
    return {
        take: PAGE_SIZE,
        skip: (page.value - 1) * PAGE_SIZE,
        search: filterValues.value.id || undefined,
        requestType: filterValues.value.type || undefined,
        status: filterValues.value.status || undefined,
    };
}

async function load(): Promise<void> {
    loading.value = true;
    try {
        const [managerOptions, inbox] = await Promise.all([
            managers.value.length ? Promise.resolve(managers.value) : fetchManagerOptions(),
            fetchApprovalsInbox(
                buildOptions(activeTab.value === 'awaiting'),
                buildOptions(activeTab.value === 'all'),
            ),
        ]);
        managers.value = managerOptions;
        awaitingBadgeCount.value = inbox.awaitingMyDecision.totalItems;

        const activePage =
            activeTab.value === 'awaiting' ? inbox.awaitingMyDecision : inbox.allInvolved;
        totalItems.value = activePage.totalItems;

        // Reference resolution is necessarily page-scoped now (server-side pagination — see
        // api/approvals.ts) — a customer/order name search across the FULL inbox would need the
        // backend to resolve those names itself, not just this page's ~10 rows.
        const orderIds = new Set<string>();
        for (const request of activePage.items) {
            if (request.requestType !== 'priceAdjustmentApproval') continue;
            try {
                const payload = JSON.parse(request.payload) as { orderId?: string };
                if (payload.orderId) orderIds.add(payload.orderId);
            } catch {
                // ignore malformed payload — reference just won't resolve for this row
            }
        }
        const [orderReferences, counterpartyReferences]: [
            Map<string, OrderReference>,
            Map<string, CounterpartyReference>,
        ] = await Promise.all([
            fetchOrderReferences([...orderIds]),
            fetchCounterpartyReferencesByErpId(),
        ]);

        rows.value = buildApprovalRows(activePage.items, managers.value, orderReferences, counterpartyReferences);
    } finally {
        loading.value = false;
    }
}

const filterSuggestions = ref<Record<string, string[]>>({});
watch(rows, newRows => {
    filterSuggestions.value = deriveFilterSuggestions(newRows, APPROVAL_FILTER_FIELDS);
});

watch([activeTab, filterValues], () => {
    page.value = 1;
    void load();
});
watch(page, () => void load());

onMounted(load);
</script>

<template>
    <div class="approvals-page">
        <div class="approvals-page__header">
            <div class="approvals-page__breadcrumb">Workspace / Approvals</div>
            <h1 class="approvals-page__title">Approvals</h1>
        </div>

        <div class="approvals-page__tabs">
            <button
                type="button"
                class="approvals-page__tab"
                :class="{ 'approvals-page__tab--active': activeTab === 'awaiting' }"
                @click="activeTab = 'awaiting'"
            >
                Awaiting my decision
                <span v-if="awaitingBadgeCount" class="approvals-page__tab-count">
                    {{ awaitingBadgeCount }}
                </span>
            </button>
            <button
                type="button"
                class="approvals-page__tab"
                :class="{ 'approvals-page__tab--active': activeTab === 'all' }"
                @click="activeTab = 'all'"
            >
                All requests I'm involved in
            </button>
        </div>

        <MvPanel class="approvals-page__main">
            <MvTableFilters
                :fields="APPROVAL_FILTER_FIELDS"
                :model-value="filterValues"
                :suggestions="filterSuggestions"
                @update:model-value="filterValues = $event"
                @reset="resetFilters"
            />

            <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
            <ApprovalsTable :rows="rows" :page-size="PAGE_SIZE" :loading="loading" />
            <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
        </MvPanel>
    </div>
</template>

<style scoped>
.approvals-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.approvals-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.approvals-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.approvals-page__tabs {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.approvals-page__tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 10px 4px;
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
}

.approvals-page__tab--active {
    color: var(--el-color-primary-dark-2, #008a70);
    border-bottom-color: var(--el-color-primary, #00b894);
}

.approvals-page__tab-count {
    background: #fee2e2;
    color: #dc2626;
    border-radius: 999px;
    font-size: 11px;
    padding: 1px 7px;
}
</style>
