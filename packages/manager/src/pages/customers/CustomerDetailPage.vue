<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MvPanel, MvStatusBadge, MvSelect, MvKpiCard, MvKpiCarousel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    fetchCustomerById,
    fetchCreditForCounterparty,
    fetchCustomerIdForCounterparty,
    fetchOrdersForCustomer,
    fetchDiscountGrantsForCounterparty,
    fetchDocumentsForCounterparty,
    reassignCounterpartyManager,
    type CustomerListItem,
    type CustomerCredit,
    type CustomerOrderItem,
    type DiscountRuleItem,
    type CustomerDocument,
} from '../../api/customers';
import { fetchManagerOptions, fetchBranchOptions, type ManagerOption, type BranchOption } from '../../api/orders';
import { fetchInvoicesForCounterparty, fetchOutstandingBalance, type InvoiceListItem, type OutstandingBalance } from '../../api/invoices';
import { fetchPaymentsForCounterparty, type PaymentListItem } from '../../api/payments';
import type { EntityRef } from '../../api/history';
import CustomerOverviewTab from '../../components/customers/CustomerOverviewTab.vue';
import CustomerOrdersTab from '../../components/customers/CustomerOrdersTab.vue';
import CustomerDiscountsTab from '../../components/customers/CustomerDiscountsTab.vue';
import CustomerDocumentsTab from '../../components/customers/CustomerDocumentsTab.vue';
import CustomerInvoicesTab from '../../components/customers/CustomerInvoicesTab.vue';
import CustomerPaymentsTab from '../../components/customers/CustomerPaymentsTab.vue';
import EntityHistoryPanel from '../../components/history/EntityHistoryPanel.vue';
import AccountTeamPanel from '../../components/customers/AccountTeamPanel.vue';

// Human labels for the generic EntityHistoryPanel widget — only the entity types this page
// versions need an entry; anything else falls back to its raw entityName.
const HISTORY_ENTITY_LABELS = { Counterparty: 'Customer', TradingPoint: 'Trading point' };

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const customer = ref<CustomerListItem | null>(null);
const credit = ref<CustomerCredit | null>(null);
const outstandingBalance = ref<OutstandingBalance | null>(null);
const managers = ref<ManagerOption[]>([]);
const branches = ref<BranchOption[]>([]);
const orders = ref<CustomerOrderItem[]>([]);
const discounts = ref<DiscountRuleItem[]>([]);
const documents = ref<CustomerDocument[]>([]);
const invoices = ref<InvoiceListItem[]>([]);
const payments = ref<PaymentListItem[]>([]);
const loading = ref(true);
const notFound = ref(false);
const reassigning = ref(false);
const reassignError = ref('');

// Gate directly on the same permission the backend mutation/queries themselves check
// (CustomPermission.ReassignCounterpartyManager / ReadEntityHistory) — not a role-code
// allowlist. Whoever the native Vendure admin UI grants this permission to sees the control;
// the mutation/query is still the real enforcement, this only avoids showing a control that
// would just be rejected.
const canReassign = computed(() => authStore.hasPermission('ReassignCounterpartyManager'));
const canViewHistory = computed(() => authStore.hasPermission('ReadEntityHistory'));
const canManageTeam = computed(() => authStore.hasPermission('ManageCounterpartyTeam'));

type CustomerDetailTab = 'overview' | 'orders' | 'invoices' | 'payments' | 'discounts' | 'documents' | 'history';
const TABS: CustomerDetailTab[] = ['overview', 'orders', 'invoices', 'payments', 'discounts', 'documents', 'history'];

function tabFromQuery(): CustomerDetailTab {
    const q = route.query.tab;
    return typeof q === 'string' && (TABS as string[]).includes(q) ? (q as CustomerDetailTab) : 'overview';
}

const activeTab = ref<CustomerDetailTab>(tabFromQuery());

watch(activeTab, tab => {
    router.replace({ query: { ...route.query, tab } });
});
// EntityHistoryPanel now owns its own fetching/pagination (issue #39) — this page only supplies
// the refs to fetch for, not a pre-loaded array.
const historyRefs = ref<EntityRef[]>([]);

// Terminal states orders no longer need attention in — mirrors the 'Delivered'/'Cancelled'
// options in api/orders.ts's ORDER_STATE_OPTIONS.
const CLOSED_ORDER_STATES = new Set(['Delivered', 'Cancelled']);

const sales30d = computed(() => {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return orders.value
        .filter(o => o.orderPlacedAt && new Date(o.orderPlacedAt).getTime() >= since)
        .reduce((sum, o) => sum + o.totalWithTax, 0);
});

const openOrdersCount = computed(
    () => orders.value.filter(o => !CLOSED_ORDER_STATES.has(o.state)).length,
);

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
}

async function load(): Promise<void> {
    loading.value = true;
    notFound.value = false;
    try {
        const counterpartyId = route.params.id as string;
        const [detail, creditResult, managerOptions, branchOptions] = await Promise.all([
            fetchCustomerById(counterpartyId),
            fetchCreditForCounterparty(counterpartyId),
            managers.value.length ? Promise.resolve(managers.value) : fetchManagerOptions(),
            branches.value.length ? Promise.resolve(branches.value) : fetchBranchOptions(),
        ]);
        managers.value = managerOptions;
        branches.value = branchOptions;
        if (!detail) {
            notFound.value = true;
            return;
        }
        customer.value = detail;
        credit.value = creditResult;

        const [customerId, grants, docs] = await Promise.all([
            fetchCustomerIdForCounterparty(counterpartyId),
            fetchDiscountGrantsForCounterparty(counterpartyId),
            fetchDocumentsForCounterparty(counterpartyId),
        ]);
        discounts.value = grants;
        documents.value = docs;
        orders.value = customerId ? await fetchOrdersForCustomer(customerId) : [];
        // Invoice.counterpartyId ties directly to the counterparty (unlike Order, which needs
        // the customerId lookup above) — no equivalent indirection needed here.
        [invoices.value, payments.value, outstandingBalance.value] = await Promise.all([
            fetchInvoicesForCounterparty(counterpartyId),
            fetchPaymentsForCounterparty(counterpartyId),
            fetchOutstandingBalance(counterpartyId),
        ]);

        if (canViewHistory.value) {
            historyRefs.value = [
                { entityName: 'Counterparty', entityId: counterpartyId },
                ...detail.tradingPoints.map(tp => ({ entityName: 'TradingPoint', entityId: tp.id })),
            ];
        }
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch(() => route.params.id, load);
watch(
    () => route.query.tab,
    () => {
        activeTab.value = tabFromQuery();
    },
);

function managerName(id: string | null): string | null {
    if (!id) return null;
    return managers.value.find(m => m.id === id)?.name ?? null;
}

function branchName(erpId: string | null): string | null {
    if (!erpId) return null;
    return branches.value.find(b => b.erpId === erpId)?.name ?? null;
}

async function handleReassign(administratorId: string): Promise<void> {
    if (!customer.value || !administratorId) return;
    reassignError.value = '';
    reassigning.value = true;
    try {
        await reassignCounterpartyManager(customer.value.id, administratorId);
        customer.value = { ...customer.value, assignedManagerId: administratorId };
    } catch (e) {
        reassignError.value = e instanceof Error ? e.message : 'Could not reassign manager';
    } finally {
        reassigning.value = false;
    }
}
</script>

<template>
    <div v-if="notFound" class="customer-detail__not-found">
        <h1>Customer not found</h1>
        <RouterLink to="/customers">Back to customers</RouterLink>
    </div>

    <div v-else-if="customer" class="customer-detail">
        <div class="customer-detail__breadcrumb">
            <RouterLink to="/customers">Customers</RouterLink> / {{ customer.shortName }}
        </div>
        <h1 class="customer-detail__title">
            {{ customer.shortName }}
            <MvStatusBadge :variant="customer.isActive ? 'success' : 'neutral'">
                {{ customer.isActive ? 'Active' : 'Inactive' }}
            </MvStatusBadge>
            <MvStatusBadge v-if="customer.erpGroupLabel" variant="info">
                {{ customer.erpGroupLabel }}
            </MvStatusBadge>
        </h1>
        <p class="customer-detail__subtitle">
            <span v-if="customer.inn">INN {{ customer.inn }} · </span>
            <template v-if="!canReassign">
                <span v-if="managerName(customer.assignedManagerId)">
                    Manager: {{ managerName(customer.assignedManagerId) }}
                </span>
                <span v-else>No manager assigned</span>
            </template>
            <span v-else class="customer-detail__manager-control">
                Manager:
                <MvSelect
                    :model-value="customer.assignedManagerId ?? ''"
                    :options="[{ value: '', label: 'Unassigned' }, ...managers.map(m => ({ value: m.id, label: m.name }))]"
                    :disabled="reassigning"
                    @update:model-value="handleReassign($event)"
                />
            </span>
        </p>
        <p v-if="reassignError" class="customer-detail__error">{{ reassignError }}</p>
        <AccountTeamPanel
            :counterparty-id="customer.id"
            :owner-id="customer.assignedManagerId"
            :owner-name="managerName(customer.assignedManagerId)"
            :managers="managers"
            :can-manage="canManageTeam"
        />
        <div class="customer-detail__meta">
            <span v-if="branchName(customer.branchId)">Location: {{ branchName(customer.branchId) }}</span>
            <span v-if="credit">Credit limit: {{ money(credit.creditLimit) }}</span>
        </div>

        <MvKpiCarousel v-if="!loading" class="customer-detail__kpis">
            <MvKpiCard label="Sales last 30 days" :value="money(sales30d)" />
            <MvKpiCard label="Open orders" :value="openOrdersCount" />
            <MvKpiCard
                label="Outstanding balance"
                :value="outstandingBalance ? money(outstandingBalance.amount) : money(0)"
            />
            <MvKpiCard
                v-if="credit"
                label="Available credit"
                :value="money(credit.creditLimit - credit.creditBalance)"
            />
        </MvKpiCarousel>

        <div class="customer-detail__tabs">
            <button type="button" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">
                Overview
            </button>
            <button type="button" :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">
                Orders
            </button>
            <button type="button" :class="{ active: activeTab === 'invoices' }" @click="activeTab = 'invoices'">
                Invoices
            </button>
            <button type="button" :class="{ active: activeTab === 'payments' }" @click="activeTab = 'payments'">
                Payments
            </button>
            <button type="button" :class="{ active: activeTab === 'discounts' }" @click="activeTab = 'discounts'">
                Discounts
            </button>
            <button type="button" :class="{ active: activeTab === 'documents' }" @click="activeTab = 'documents'">
                Documents
            </button>
            <button
                v-if="canViewHistory"
                type="button"
                :class="{ active: activeTab === 'history' }"
                @click="activeTab = 'history'"
            >
                History
            </button>
        </div>

        <MvPanel v-if="!loading">
            <CustomerOverviewTab
                v-if="activeTab === 'overview'"
                :customer="customer"
                :credit="credit"
                @changed="load"
            />
            <CustomerOrdersTab v-else-if="activeTab === 'orders'" :orders="orders" />
            <CustomerInvoicesTab
                v-else-if="activeTab === 'invoices'"
                :invoices="invoices"
                :counterparty-id="customer.id"
            />
            <CustomerPaymentsTab
                v-else-if="activeTab === 'payments'"
                :payments="payments"
                :counterparty-id="customer.id"
            />
            <CustomerDiscountsTab v-else-if="activeTab === 'discounts'" :discounts="discounts" />
            <CustomerDocumentsTab v-else-if="activeTab === 'documents'" :documents="documents" />
            <EntityHistoryPanel
                v-else
                :refs="historyRefs"
                :managers="managers"
                :entity-labels="HISTORY_ENTITY_LABELS"
            />
        </MvPanel>
    </div>
</template>

<style scoped>
.customer-detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 900px;
}

.customer-detail__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.customer-detail__breadcrumb a {
    color: inherit;
    text-decoration: none;
}

.customer-detail__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
    display: flex;
    align-items: center;
    gap: 12px;
}

.customer-detail__subtitle {
    margin: 0;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.customer-detail__manager-control {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.customer-detail__manager-control :deep(.mv-select) {
    width: auto;
    height: 28px;
    padding: 0 8px;
    font-size: 13px;
}

.customer-detail__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 0;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.customer-detail__error {
    margin: 4px 0 0;
    color: var(--el-color-danger, #dc2626);
    font-size: 13px;
}

.customer-detail__kpis {
    margin-top: 4px;
}

.customer-detail__tabs {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    margin-top: 8px;
}

.customer-detail__tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 10px 4px;
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
}

.customer-detail__tabs button.active {
    color: var(--el-color-primary-dark-2, #008a70);
    border-bottom-color: var(--el-color-primary, #00b894);
}

.customer-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
