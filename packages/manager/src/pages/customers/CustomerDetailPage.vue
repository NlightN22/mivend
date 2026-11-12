<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvPanel, MvStatusBadge, MvSkeleton } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useTabSync } from '../../composables/useTabSync';
import { useCurrency } from '../../composables/useCurrency';
import {
    fetchCustomerById,
    fetchCreditForCounterparty,
    fetchCustomerIdForCounterparty,
    type CustomerListItem,
    type CustomerCredit,
} from '../../api/customers';
import {
    fetchManagerOptions,
    fetchBranchOptions,
    type ManagerOption,
    type BranchOption,
} from '../../api/orders';
import { fetchOutstandingBalance, type OutstandingBalance } from '../../api/proforma-invoices';
import { fetchCounterpartyTeam, type CounterpartyTeamMember } from '../../api/counterpartyTeam';
import type { EntityRef } from '../../api/history';
import { Location, Wallet, User } from '@element-plus/icons-vue';
// Tab icons use Tabler (the frontend-rules skill's "Icon kit" rule) — pick from there first before adding any
// other icon package.
import {
    IconHome2,
    IconShoppingBag,
    IconFileInvoice,
    IconCreditCard,
    IconDiscount,
    IconFolder,
    IconUsers,
    IconHistory,
    IconKey,
    IconListDetails,
} from '@tabler/icons-vue';
import CustomerOverviewTab from '../../components/customers/CustomerOverviewTab.vue';
import CustomerMetricsKpis from '../../components/customers/CustomerMetricsKpis.vue';
import OrdersList from '../../components/orders/OrdersList.vue';
import CustomerDiscountsTab from '../../components/customers/CustomerDiscountsTab.vue';
import CustomerDocumentsTab from '../../components/customers/CustomerDocumentsTab.vue';
import ProformaInvoicesList from '../../components/proforma-invoices/ProformaInvoicesList.vue';
import SettlementsList from '../../components/settlements/SettlementsList.vue';
import CustomerTeamTab from '../../components/customers/CustomerTeamTab.vue';
import CustomerPortalUsersTab from '../../components/customers/CustomerPortalUsersTab.vue';
import ActAsCustomerButton from '../../components/acting/ActAsCustomerButton.vue';
import EntityHistoryPanel from '../../components/history/EntityHistoryPanel.vue';
import EntityChangeJournal from '../../components/change-journal/EntityChangeJournal.vue';
import { CHANGE_JOURNAL_LABELS } from '../../components/change-journal/changeJournalLabels';

const { t } = useI18n();

// Human labels for the generic EntityHistoryPanel widget — only the entity types this page
// versions need an entry; anything else falls back to its raw entityName.
const historyEntityLabels = computed(() => ({
    Counterparty: t('customers.detail.entities.Counterparty'),
    TradingPoint: t('customers.detail.entities.TradingPoint'),
}));

const route = useRoute();
const authStore = useAuthStore();

const customer = ref<CustomerListItem | null>(null);
const credit = ref<CustomerCredit | null>(null);
const outstandingBalance = ref<OutstandingBalance | null>(null);
const managers = ref<ManagerOption[]>([]);
const branches = ref<BranchOption[]>([]);
// The Vendure Customer id, resolved from the route's counterparty id — distinct from
// customer.value.id (the counterparty id) and required by visibleOrders(customerId: ...).
const vendureCustomerId = ref<string | null>(null);
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
const canViewSettlements = computed(() => authStore.hasPermission('ReadSettlementDocument'));
const canViewHistory = computed(() => authStore.hasPermission('ReadEntityHistory'));
const canViewChangeJournal = computed(() => authStore.hasPermission('ReadChangeJournal'));
const canManageTeam = computed(() => authStore.hasPermission('ManageCounterpartyTeam'));
// Issue #120, Decision 5 — same permission gates both this tab's visibility and its Deactivate
// action (one permission, two surfaces, per the carried-over decision).
const canManagePortalAccess = computed(() =>
    authStore.hasPermission('ManageCounterpartyPortalAccess'),
);

type CustomerDetailTab =
    | 'overview'
    | 'orders'
    | 'proformaInvoices'
    | 'settlements'
    | 'discounts'
    | 'documents'
    | 'team'
    | 'portalUsers'
    | 'history'
    | 'changeJournal';
const TABS: CustomerDetailTab[] = [
    'overview',
    'orders',
    'proformaInvoices',
    'settlements',
    'discounts',
    'documents',
    'team',
    'portalUsers',
    'history',
    'changeJournal',
];
const tabLabel = (tab: CustomerDetailTab): string =>
    tab === 'changeJournal' ? CHANGE_JOURNAL_LABELS.tab : t(`customers.detail.tabs.${tab}`);
const TAB_ICONS: Record<CustomerDetailTab, typeof IconHome2> = {
    overview: IconHome2,
    orders: IconShoppingBag,
    proformaInvoices: IconFileInvoice,
    settlements: IconCreditCard,
    discounts: IconDiscount,
    documents: IconFolder,
    team: IconUsers,
    portalUsers: IconKey,
    history: IconHistory,
    changeJournal: IconListDetails,
};

// Tab-switch/URL-sync logic lives in useTabSync.ts (unit-tested there) — see its own doc comment
// for the two real regressions this replaced.
const { activeTab: requestedTab, selectTab: selectTabInternal } = useTabSync<CustomerDetailTab>(
    TABS,
    'overview',
);

// Mobile-only tab-overflow pattern, see the manager-portal-rules skill — 7 tabs don't fit a
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
const visibleTabs = computed(() =>
    TABS.filter(t => t !== 'history' || canViewHistory.value)
        .filter(t => t !== 'changeJournal' || canViewChangeJournal.value)
        .filter(t => t !== 'settlements' || canViewSettlements.value)
        .filter(t => t !== 'portalUsers' || canManagePortalAccess.value),
);
const primaryTabs = computed(() =>
    isMobile.value ? visibleTabs.value.slice(0, PRIMARY_TAB_COUNT) : visibleTabs.value,
);
const overflowTabs = computed(() =>
    isMobile.value ? visibleTabs.value.slice(PRIMARY_TAB_COUNT) : [],
);
// A tab the person may not open (e.g. ?tab=settlements without the permission) falls back to the overview.
const activeTab = computed<CustomerDetailTab>(() =>
    visibleTabs.value.includes(requestedTab.value) ? requestedTab.value : 'overview',
);
const isOverflowActive = computed(() => overflowTabs.value.includes(activeTab.value));
const tabsMoreOpen = ref(false);
const tabsMoreRef = ref<HTMLElement | null>(null);

function selectTab(tab: CustomerDetailTab): void {
    selectTabInternal(tab);
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

const { formatWhole } = useCurrency();

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

        vendureCustomerId.value = await fetchCustomerIdForCounterparty(counterpartyId);
        teamMembers.value = await fetchCounterpartyTeam(counterpartyId);
        // The list tabs own their fetching; this page only needs the unpaid proforma amount for its KPI card.
        outstandingBalance.value = await fetchOutstandingBalance(counterpartyId);

        if (canViewHistory.value) {
            historyRefs.value = [
                { entityName: 'Counterparty', entityId: counterpartyId },
                ...detail.tradingPoints.map(tp => ({
                    entityName: 'TradingPoint',
                    entityId: tp.id,
                })),
            ];
        }
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch(() => route.params.id, load);

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

// `customer.branchId` (Counterparty.branchId) is a mivend Branch.id, never Branch.erpId — see
// BranchOption's own doc comment for why (real, live bug this fixes: this used to compare
// against `b.erpId`, which never matched, silently showing "—" for every counterparty with a
// real branch assigned).
function branchName(branchId: string | null): string | null {
    if (!branchId) return null;
    return branches.value.find(b => b.id === branchId)?.name ?? null;
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
        <h1>{{ t('customers.detail.notFound') }}</h1>
        <RouterLink to="/customers">{{ t('customers.detail.backToCustomers') }}</RouterLink>
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
            <RouterLink to="/customers">{{ t('customers.detail.breadcrumb') }}</RouterLink> /
            {{ customer.shortName }}
        </div>
        <h1 class="customer-detail__title">
            <span class="customer-detail__name">{{ customer.shortName }}</span>
            <MvStatusBadge :variant="customer.isActive ? 'success' : 'neutral'">
                {{ t(customer.isActive ? 'customers.detail.active' : 'customers.detail.inactive') }}
            </MvStatusBadge>
            <MvStatusBadge
                v-if="customer.erpGroupLabel"
                variant="info"
                class="customer-detail__group"
            >
                {{ customer.erpGroupLabel }}
            </MvStatusBadge>
        </h1>
        <p v-if="customer.inn" class="customer-detail__subtitle">
            {{ t('customers.detail.inn', { inn: customer.inn }) }}
        </p>
        <ActAsCustomerButton :counterparty-id="customer.id" />
        <MvStatusBadge
            v-if="customer.innStatus === 'missing'"
            variant="warning"
            class="customer-detail__notice"
        >
            {{ t('customers.detail.innMissing') }}
        </MvStatusBadge>
        <MvStatusBadge
            v-else-if="customer.innStatus === 'duplicate'"
            variant="warning"
            class="customer-detail__notice"
        >
            {{ t('customers.detail.innDuplicate') }}
        </MvStatusBadge>

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
                    <span class="customer-detail__info-label">{{
                        t('customers.detail.location')
                    }}</span>
                    <span class="customer-detail__info-value">{{
                        branchName(customer.branchId) ?? '—'
                    }}</span>
                </div>
            </div>
            <span class="customer-detail__info-divider" />
            <div class="customer-detail__info-item">
                <Wallet class="customer-detail__info-icon" />
                <div class="customer-detail__info-text">
                    <span class="customer-detail__info-label">{{
                        t('customers.detail.creditLimit')
                    }}</span>
                    <span class="customer-detail__info-value">{{
                        credit ? formatWhole(credit.creditLimit) : '—'
                    }}</span>
                </div>
            </div>
            <template v-if="credit && credit.paymentDelayDays > 0">
                <span class="customer-detail__info-divider" />
                <div class="customer-detail__info-item">
                    <Wallet class="customer-detail__info-icon" />
                    <div class="customer-detail__info-text">
                        <span class="customer-detail__info-label">{{
                            t('customers.detail.paymentTerms')
                        }}</span>
                        <span class="customer-detail__info-value">{{
                            t(
                                'customers.overview.days',
                                { count: credit.paymentDelayDays },
                                credit.paymentDelayDays,
                            )
                        }}</span>
                    </div>
                </div>
            </template>
            <span class="customer-detail__info-divider" />
            <div class="customer-detail__info-item">
                <span class="customer-detail__avatar">{{
                    initials(managerName(customer.assignedManagerId))
                }}</span>
                <div class="customer-detail__info-text">
                    <span class="customer-detail__info-label">{{
                        t('customers.detail.primaryManager')
                    }}</span>
                    <span class="customer-detail__info-value">{{
                        managerName(customer.assignedManagerId) ?? t('customers.detail.unassigned')
                    }}</span>
                </div>
            </div>
            <div class="customer-detail__info-item">
                <span class="customer-detail__avatar">{{ initials(backupManagerName) }}</span>
                <div class="customer-detail__info-text">
                    <span class="customer-detail__info-label">{{
                        t('customers.detail.backupManager')
                    }}</span>
                    <span class="customer-detail__info-value">{{ backupManagerName ?? '—' }}</span>
                </div>
            </div>
            <span class="customer-detail__info-divider" />
            <div class="customer-detail__info-item">
                <User class="customer-detail__info-icon" />
                <div class="customer-detail__info-text">
                    <span class="customer-detail__info-label">{{
                        t('customers.detail.observers')
                    }}</span>
                    <span class="customer-detail__info-value">{{ observerCount }}</span>
                </div>
            </div>
        </div>

        <CustomerMetricsKpis
            v-if="!loading"
            :counterparty-id="String(route.params.id)"
            :unpaid-proforma-minor="outstandingBalance?.amount ?? 0"
            :available-credit="credit ? credit.creditLimit - credit.creditBalance : null"
        />

        <div class="customer-detail__tabs">
            <button
                v-for="tab in primaryTabs"
                :key="tab"
                type="button"
                :class="{ active: activeTab === tab }"
                @click="selectTab(tab)"
            >
                <component :is="TAB_ICONS[tab]" class="customer-detail__tab-icon" />
                {{ tabLabel(tab) }}
            </button>
            <div v-if="overflowTabs.length" ref="tabsMoreRef" class="customer-detail__tabs-more">
                <button
                    type="button"
                    class="customer-detail__tabs-more-trigger"
                    :class="{ active: isOverflowActive }"
                    @click="tabsMoreOpen = !tabsMoreOpen"
                >
                    <component
                        v-if="isOverflowActive"
                        :is="TAB_ICONS[activeTab]"
                        class="customer-detail__tab-icon"
                    />
                    {{ isOverflowActive ? tabLabel(activeTab) : t('customers.detail.more') }} ▾
                </button>
                <div v-if="tabsMoreOpen" class="customer-detail__tabs-more-menu">
                    <button
                        v-for="tab in overflowTabs"
                        :key="tab"
                        type="button"
                        :class="{ active: activeTab === tab }"
                        @click="selectTab(tab)"
                    >
                        <component :is="TAB_ICONS[tab]" class="customer-detail__tab-icon" />
                        {{ tabLabel(tab) }}
                    </button>
                </div>
            </div>
        </div>

        <MvPanel v-if="!loading">
            <CustomerOverviewTab
                v-if="activeTab === 'overview'"
                :customer="customer"
                :credit="credit"
                :managers="managers"
                @changed="load"
            />
            <OrdersList
                v-else-if="activeTab === 'orders' && vendureCustomerId"
                :customer-id="vendureCustomerId"
                url-prefix="orders."
            />
            <p v-else-if="activeTab === 'orders'" class="customer-detail__no-orders">
                {{ t('customers.detail.noOrders') }}
            </p>
            <ProformaInvoicesList
                v-else-if="activeTab === 'proformaInvoices'"
                :counterparty-id="customer.id"
                url-prefix="proformaInvoices."
            />
            <SettlementsList
                v-else-if="activeTab === 'settlements'"
                :counterparty-id="customer.id"
                url-prefix="settlements."
            />
            <CustomerDiscountsTab
                v-else-if="activeTab === 'discounts'"
                :counterparty-id="customer.id"
            />
            <CustomerDocumentsTab
                v-else-if="activeTab === 'documents'"
                :counterparty-id="customer.id"
            />
            <CustomerTeamTab
                v-else-if="activeTab === 'team'"
                :counterparty-id="customer.id"
                :owner-id="customer.assignedManagerId"
                :owner-name="managerName(customer.assignedManagerId)"
                :managers="managers"
                :can-manage="canManageTeam"
                @loaded="teamMembers = $event"
            />
            <CustomerPortalUsersTab
                v-else-if="activeTab === 'portalUsers'"
                :counterparty-id="customer.id"
                :can-manage="canManagePortalAccess"
            />
            <EntityChangeJournal
                v-else-if="activeTab === 'changeJournal'"
                entity-type="Counterparty"
                :entity-id="customer.id"
                :managers="managers"
            />
            <EntityHistoryPanel
                v-else
                :refs="historyRefs"
                :managers="managers"
                :entity-labels="historyEntityLabels"
            />
        </MvPanel>
    </div>
</template>

<style scoped>
.customer-detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
}

.customer-detail > * {
    min-width: 0;
    max-width: 100%;
}

.customer-detail__breadcrumb {
    color: var(--el-text-color-secondary);
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
    flex-wrap: wrap;
    gap: 8px 12px;
}

.customer-detail__name {
    min-width: 0;
    overflow-wrap: anywhere;
}

.customer-detail__group,
.customer-detail__notice {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
}

.customer-detail__subtitle {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.customer-detail__info-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 24px;
    padding: 20px 24px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-lg, 16px);
    background: var(--app-surface);
    box-shadow: var(--app-shadow-sm);
}

.customer-detail__info-divider {
    width: 1px;
    align-self: stretch;
    background: var(--el-border-color);
}

.customer-detail__info-item {
    display: flex;
    align-items: center;
    gap: 10px;
}

.customer-detail__info-icon {
    width: 18px;
    height: 18px;
    color: var(--el-text-color-secondary);
    flex-shrink: 0;
}

.customer-detail__avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
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
    color: var(--el-text-color-secondary);
}

.customer-detail__info-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
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
    border-bottom: 1px solid var(--el-border-color);
    margin-top: 8px;
}

.customer-detail__tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--el-border-color);
    margin-top: 8px;
    position: relative;
}

.customer-detail__tabs {
    min-width: 0;
}

.customer-detail__tabs > button {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.customer-detail__tabs-more {
    flex-shrink: 0;
}

.customer-detail__tabs > button,
.customer-detail__tabs-more-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 10px 4px;
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-secondary);
    cursor: pointer;
    white-space: nowrap;
}

.customer-detail__tabs > button.active,
.customer-detail__tabs-more-trigger.active {
    color: var(--el-color-primary-dark-2);
    border-bottom-color: var(--el-color-primary);
}

.customer-detail__tab-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
}

.customer-detail__tabs-more {
    position: relative;
}

.customer-detail__tabs-more-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: var(--mv-z-dropdown);
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 6px;
    background: var(--app-surface);
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    box-shadow: var(--app-shadow-md);
}

.customer-detail__tabs-more-menu button {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 14px;
    font-weight: 700;
    text-align: left;
    color: var(--el-text-color-secondary);
    cursor: pointer;
}

.customer-detail__tabs-more-menu button:hover {
    background: var(--el-fill-color-light);
}

.customer-detail__tabs-more-menu button.active {
    color: var(--el-color-primary-dark-2);
    background: var(--el-color-primary-light-9);
}

.customer-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary);
}

.customer-detail__no-orders {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
}
</style>
