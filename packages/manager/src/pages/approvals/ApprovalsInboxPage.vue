<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MvPanel, MvFilterBar, MvFilterField, MvSelect } from '@mivend/ui-kit';
import {
    fetchApprovalsInbox,
    fetchOrderReferences,
    fetchCounterpartyReferencesByErpId,
    REQUEST_TYPE_LABEL,
    type ApprovalsInbox,
    type OrderReference,
    type CounterpartyReference,
} from '../../api/approvals';
import { fetchManagerOptions, type ManagerOption } from '../../api/orders';
import ApprovalsTable from '../../components/approvals/ApprovalsTable.vue';

const inbox = ref<ApprovalsInbox | null>(null);
const managers = ref<ManagerOption[]>([]);
const orderReferences = ref<Map<string, OrderReference>>(new Map());
const counterpartyReferences = ref<Map<string, CounterpartyReference>>(new Map());
const loading = ref(true);

const activeTab = ref<'awaiting' | 'all'>('awaiting');
const typeFilter = ref('');

const TYPE_OPTIONS = [
    { value: '', label: 'All types' },
    ...Object.entries(REQUEST_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

const currentList = computed(() => {
    if (!inbox.value) return [];
    const list = activeTab.value === 'awaiting' ? inbox.value.awaitingMyDecision : inbox.value.allInvolved;
    return typeFilter.value ? list.filter(r => r.requestType === typeFilter.value) : list;
});

onMounted(async () => {
    try {
        const [inboxResult, managerOptions] = await Promise.all([
            fetchApprovalsInbox(),
            fetchManagerOptions(),
        ]);
        inbox.value = inboxResult;
        managers.value = managerOptions;

        const orderIds = new Set<string>();
        for (const request of [...inboxResult.awaitingMyDecision, ...inboxResult.allInvolved]) {
            if (request.requestType !== 'priceAdjustmentApproval') continue;
            try {
                const payload = JSON.parse(request.payload) as { orderId?: string };
                if (payload.orderId) orderIds.add(payload.orderId);
            } catch {
                // ignore malformed payload — reference just won't resolve for this row
            }
        }
        [orderReferences.value, counterpartyReferences.value] = await Promise.all([
            fetchOrderReferences([...orderIds]),
            fetchCounterpartyReferencesByErpId(),
        ]);
    } finally {
        loading.value = false;
    }
});
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
                <span v-if="inbox?.awaitingMyDecision.length" class="approvals-page__tab-count">
                    {{ inbox.awaitingMyDecision.length }}
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

        <MvPanel>
            <MvFilterBar @reset="typeFilter = ''">
                <MvFilterField label="Type">
                    <MvSelect :model-value="typeFilter" :options="TYPE_OPTIONS" @update:model-value="typeFilter = $event" />
                </MvFilterField>
            </MvFilterBar>

            <ApprovalsTable
                v-if="!loading"
                :requests="currentList"
                :managers="managers"
                :order-references="orderReferences"
                :counterparty-references="counterpartyReferences"
            />
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
