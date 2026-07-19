<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MvPanel, MvStatusBadge, MvKpiCard, MvKpiCarousel, MvSkeleton } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    fetchCustomerById,
    fetchCreditForCounterparty,
    fetchCustomerIdForCounterparty,
    fetchOrdersForCustomer,
    fetchDiscountGrantsForCounterparty,
    type CustomerListItem,
    type CustomerCredit,
    type CustomerOrderItem,
    type DiscountRuleItem,
} from '../../api/customers';
import { fetchManagerOptions, fetchBranchOptions, type ManagerOption, type BranchOption } from '../../api/orders';
import { fetchOutstandingBalance, type OutstandingBalance } from '../../api/invoices';
import { fetchCounterpartyTeam, type CounterpartyTeamMember } from '../../api/counterpartyTeam';
import type { EntityRef } from '../../api/history';
import { Location, Wallet, User } from '@element-plus/icons-vue';
import CustomerOverviewTab from '../../components/customers/CustomerOverviewTab.vue';
import CustomerOrdersTab from '../../components/customers/CustomerOrdersTab.vue';
import CustomerDiscountsTab from '../../components/customers/CustomerDiscountsTab.vue';
import CustomerDocumentsTab from '../../components/customers/CustomerDocumentsTab.vue';
import CustomerInvoicesTab from '../../components/customers/CustomerInvoicesTab.vue';
import CustomerPaymentsTab from '../../components/customers/CustomerPaymentsTab.vue';
import CustomerTeamTab from '../../components/customers/CustomerTeamTab.vue';
import EntityHistoryPanel from '../../components/history/EntityHistoryPanel.vue';

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
// The Vendure Customer id, resolved from the route's counterparty id — distinct from
// customer.value.id (the counterparty id) and required by visibleOrders(customerId: ...).
const vendureCustomerId = ref<string | null>(null);
const discounts = ref<DiscountRuleItem[]>([]);
// Fed by CustomerTeamTab's own @loaded emit (see below) once the Team tab has fetched — this
// page also fetches it directly in load() so the header's compact Backup manager / Observers
// summary has data even before the Team tab is opened.
const teamMembers = ref<CounterpartyTeamMember[]>([]);
const loading = ref(true);
const notFound = ref(false);

// Gate directly on the same permission the backend query itself checks (CustomPermission.
// ReadEntityHistory) — not a role-code allowlist. Reassigning the primary manager moved out of
// this header (info-only now, see the info-row's own doc comment) — that edit belongs on a
// future Team tab, gated to specific roles, not here.
const canViewHistory = computed(() => authStore.hasPermission('ReadEntityHistory'));
const canManageTeam = computed(() => authStore.hasPermission('ManageCounterpartyTeam'));

type CustomerDetailTab =
    | 'overview'
    | 'orders'
    | 'invoices'
    | 'payments'
    | 'discounts'
    | 'documents'
    | 'team'
    | 'history';
const TABS: CustomerDetailTab[] = [
    'overview',
    'orders',
    'invoices',
    'payments',
    'discounts',
    'documents',
    'team',
    'history',
];
const TAB_LABELS: Record<CustomerDetailTab, string> = {
    overview: 'Overview',
    orders: 'Orders',
    invoices: 'Invoices',
    payments: 'Payments',
    discounts: 'Discounts',
    documents: 'Documents',
    team: 'Team',
    history: 'History',
};

function tabFromQuery(): CustomerDetailTab {
    const q = route.query.tab;
    return typeof q === 'string' && (TABS as string[]).includes(q) ? (q as CustomerDetailTab) : 'overview';
}

const activeTab = ref<CustomerDetailTab>(tabFromQuery());

watch(activeTab, tab => {
    router.replace({ query: { ...route.query, tab } });
});

// Mobile-only tab-overflow pattern, see AGENTS.md's "Manager portal rules" — 7 tabs don't fit a
// mobile row; the first 3 (most used day-to-day) stay visible, the rest collapse into "More",
// mirroring the same primary/overflow split DefaultLayout.vue already uses for the bottom nav.
// Desktop has room for the full row, so it's shown in full there — same breakpoint as
// MvAppTopbar/MvAppMobileNav's own `max-width: 800px` mobile switch.
const MOBILE_BREAKPOINT = '(max-width: 800px)';
const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT);
const isMobile = ref(mobileQuery.matches);
function handleMobileQueryChange(e: MediaQueryListEvent): void {
    isMobile.value = e.matches;
}

const PRIMARY_TAB_COUNT = 3;
const visibleTabs = computed(() => TABS.filter(t => t !== 'history' || canViewHistory.value));
const primaryTabs = computed(() => (isMobile.value ? visibleTabs.value.slice(0, PRIMARY_TAB_COUNT) : visibleTabs.value));
const overflowTabs = computed(() => (isMobile.value ? visibleTabs.value.slice(PRIMARY_TAB_COUNT) : []));
const isOverflowActive = computed(() => overflowTabs.value.includes(activeTab.value));
const tabsMoreOpen = ref(false);
const tabsMoreRef = ref<HTMLElement | null>(null);

function selectTab(tab: CustomerDetailTab): void {
    activeTab.value = tab;
    tabsMoreOpen.value = false;
}

function handleOutsideClick(e: MouseEvent): void {
    if (tabsMoreRef.value && !tabsMoreRef.value.contains(e.target as Node)) {
        tabsMoreOpen.value = false;
    }
}

onMounted(() => {
    document.addEventListener('click', handleOutsideClick);
    mobileQuery.addEventListener('change', handleMobileQueryChange);
});
onBeforeUnmount(() => {
    document.removeEventListener('click', handleOutsideClick);
    mobileQuery.removeEventListener('change', handleMobileQueryChange);
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

        const [customerId, grants] = await Promise.all([
            fetchCustomerIdForCounterparty(counterpartyId),
            fetchDiscountGrantsForCounterparty(counterpartyId),
        ]);
        discounts.value = grants;
        vendureCustomerId.value = customerId;
        orders.value = customerId ? await fetchOrdersForCustomer(customerId) : [];
        teamMembers.value = await fetchCounterpartyTeam(counterpartyId);
        // CustomerInvoicesTab/CustomerPaymentsTab now own their own fetching/pagination (same
        // shape as CustomerOrdersTab) — this page only still needs outstandingBalance for its
        // own KPI card.
        outstandingBalance.value = await fetchOutstandingBalance(counterpartyId);

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

// First backup (a counterparty can in principle have more than one, but the header only has
// room for a single-line summary — the Team tab (CustomerTeamTab) lists every one of them).
const backupManagerName = computed(() => {
    const backup = teamMembers.value.find(m => m.role === 'backup');
    return backup ? managerName(backup.administratorId) : null;
});
const observerCount = computed(() => teamMembers.value.filter(m => m.role === 'observer').length);

function branchName(erpId: string | null): string | null {
    if (!erpId) return null;
    return branches.value.find(b => b.erpId === erpId)?.name ?? null;
}

// No photo data for administrators (ManagerOption has no avatar URL) — initials on a plain
// colored circle is the standard fallback for exactly this case, closer to the reference design
// than reusing the same generic person icon three times over for every manager slot.
function initials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

</script>

<template>
    <div v-if="notFound" class="customer-detail__not-found">
        <h1>Customer not found</h1>
        <RouterLink to="/customers">Back to customers</RouterLink>
    </div>

    <!-- First load only (no `customer` yet) — a stale-shaped skeleton is worse than nothing once
         real content exists, so tab switches / refetches after the first load fall through to
         MvPanel's own `v-if="!loading"` gap below instead of re-showing this. -->
    <div v-else-if="loading && !customer" class="customer-detail">
        <MvSkeleton width="220px" height="13px" />
        <MvSkeleton width="360px" height="28px" />
        <MvSkeleton width="180px" height="13px" />
        <div class="customer-detail__kpis-skeleton">
            <MvSkeleton v-for="i in 4" :key="i" height="84px" radius="12px" />
        </div>
        <div class="customer-detail__tabs-skeleton">
            <MvSkeleton v-for="i in 7" :key="i" width="90px" height="20px" />
        </div>
        <MvSkeleton height="320px" radius="12px" />
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
        <p v-if="customer.inn" class="customer-detail__subtitle">INN {{ customer.inn }}</p>

        <!-- Info-only row — no edit controls here at all (see AGENTS.md-style rule this page now
             follows: reassigning managers, changing location, adjusting credit limit all belong
             on a future Team tab gated to specific roles, not the header). Location has no "add"
             concept yet either way (only "change location", not built), and credit limit changes
             go through a separate approval flow (also not built) — both are plain display
             regardless. -->
        <div class="customer-detail__info-row">
            <div class="customer-detail__info-item">
                <Location class="customer-detail__info-icon" />
                <div class="customer-detail__info-text">
                    <span class="customer-detail__info-label">Location</span>
                    <span class="customer-detail__info-value">{{ branchName(customer.branchId) ?? '—' }}</span>
                </div>
            </div>
            <span class="customer-detail__info-divider" />
            <div class="customer-detail__info-item">
                <Wallet class="customer-detail__info-icon" />
                <div class="customer-detail__info-text">
                    <span class="customer-detail__info-label">Credit limit</span>
                    <span class="customer-detail__info-value">{{ credit ? money(credit.creditLimit) : '—' }}</span>
                </div>
            </div>
            <span class="customer-detail__info-divider" />
            <div class="customer-detail__info-item">
                <span class="customer-detail__avatar">{{ initials(managerName(customer.assignedManagerId)) }}</span>
                <div class="customer-detail__info-text">
                    <span class="customer-detail__info-label">Primary manager</span>
                    <span class="customer-detail__info-value">{{ managerName(customer.assignedManagerId) ?? 'Unassigned' }}</span>
                </div>
            </div>
            <div class="customer-detail__info-item">
                <span class="customer-detail__avatar">{{ initials(backupManagerName) }}</span>
                <div class="customer-detail__info-text">
                    <span class="customer-detail__info-label">Backup manager</span>
                    <span class="customer-detail__info-value">{{ backupManagerName ?? '—' }}</span>
                </div>
            </div>
            <span class="customer-detail__info-divider" />
            <div class="customer-detail__info-item">
                <User class="customer-detail__info-icon" />
                <div class="customer-detail__info-text">
                    <span class="customer-detail__info-label">Observers</span>
                    <span class="customer-detail__info-value">{{ observerCount }}</span>
                </div>
            </div>
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
            <button
                v-for="tab in primaryTabs"
                :key="tab"
                type="button"
                :class="{ active: activeTab === tab }"
                @click="selectTab(tab)"
            >
                {{ TAB_LABELS[tab] }}
            </button>
            <div v-if="overflowTabs.length" ref="tabsMoreRef" class="customer-detail__tabs-more">
                <button
                    type="button"
                    class="customer-detail__tabs-more-trigger"
                    :class="{ active: isOverflowActive }"
                    @click="tabsMoreOpen = !tabsMoreOpen"
                >
                    {{ isOverflowActive ? TAB_LABELS[activeTab] : 'More' }} ▾
                </button>
                <div v-if="tabsMoreOpen" class="customer-detail__tabs-more-menu">
                    <button
                        v-for="tab in overflowTabs"
                        :key="tab"
                        type="button"
                        :class="{ active: activeTab === tab }"
                        @click="selectTab(tab)"
                    >
                        {{ TAB_LABELS[tab] }}
                    </button>
                </div>
            </div>
        </div>

        <MvPanel v-if="!loading">
            <CustomerOverviewTab
                v-if="activeTab === 'overview'"
                :customer="customer"
                :credit="credit"
                @changed="load"
            />
            <CustomerOrdersTab
                v-else-if="activeTab === 'orders' && vendureCustomerId"
                :customer-id="vendureCustomerId"
            />
            <p v-else-if="activeTab === 'orders'" class="customer-detail__no-orders">No orders yet</p>
            <CustomerInvoicesTab
                v-else-if="activeTab === 'invoices'"
                :counterparty-id="customer.id"
            />
            <CustomerPaymentsTab
                v-else-if="activeTab === 'payments'"
                :counterparty-id="customer.id"
            />
            <CustomerDiscountsTab v-else-if="activeTab === 'discounts'" :discounts="discounts" />
            <CustomerDocumentsTab v-else-if="activeTab === 'documents'" :counterparty-id="customer.id" />
            <CustomerTeamTab
                v-else-if="activeTab === 'team'"
                :counterparty-id="customer.id"
                :owner-id="customer.assignedManagerId"
                :owner-name="managerName(customer.assignedManagerId)"
                :managers="managers"
                :can-manage="canManageTeam"
                :can-view-history="canViewHistory"
                :history-refs="historyRefs"
                @loaded="teamMembers = $event"
            />
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

.customer-detail__info-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 24px;
    padding: 20px 24px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-lg, 16px);
    background: #fff;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

.customer-detail__info-divider {
    width: 1px;
    align-self: stretch;
    background: var(--el-border-color, #e4e7ec);
}

.customer-detail__info-item {
    display: flex;
    align-items: center;
    gap: 10px;
}

.customer-detail__info-icon {
    width: 18px;
    height: 18px;
    color: var(--el-text-color-secondary, #98a2b3);
    flex-shrink: 0;
}

.customer-detail__avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--el-color-primary-light-9, #e6faf4);
    color: var(--el-color-primary, #00b894);
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
}

.customer-detail__info-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.customer-detail__info-label {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}

.customer-detail__info-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary, #17212b);
}

.customer-detail__kpis {
    margin-top: 4px;
}

.customer-detail__kpis-skeleton {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-top: 4px;
}

@media (max-width: 800px) {
    .customer-detail__kpis-skeleton {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

.customer-detail__tabs-skeleton {
    display: flex;
    gap: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    margin-top: 8px;
}

.customer-detail__tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    margin-top: 8px;
    position: relative;
}

.customer-detail__tabs > button,
.customer-detail__tabs-more-trigger {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 10px 4px;
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
    white-space: nowrap;
}

.customer-detail__tabs > button.active,
.customer-detail__tabs-more-trigger.active {
    color: var(--el-color-primary-dark-2, #008a70);
    border-bottom-color: var(--el-color-primary, #00b894);
}

.customer-detail__tabs-more {
    position: relative;
}

.customer-detail__tabs-more-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 6px;
    background: var(--app-surface, #fff);
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(20, 42, 65, 0.12);
}

.customer-detail__tabs-more-menu button {
    background: none;
    border: none;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 14px;
    font-weight: 700;
    text-align: left;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
}

.customer-detail__tabs-more-menu button:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.customer-detail__tabs-more-menu button.active {
    color: var(--el-color-primary-dark-2, #008a70);
    background: var(--el-color-primary-light-9, #f0fffa);
}

.customer-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}

.customer-detail__no-orders {
    margin: 0;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}
</style>
