<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvPanel, MvStatusBadge, MvSkeleton } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useCustomerDetailTabs } from '../../composables/useCustomerDetailTabs';
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
import CustomerMetricsKpis from '../../components/customers/CustomerMetricsKpis.vue';
import CustomerInfoRow from '../../components/customers/CustomerInfoRow.vue';
import CustomerTabBar from '../../components/customers/CustomerTabBar.vue';
import CustomerTabContent from '../../components/customers/CustomerTabContent.vue';
import ActAsCustomerButton from '../../components/acting/ActAsCustomerButton.vue';

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();
const { activeTab, primaryTabs, overflowTabs, selectTab } = useCustomerDetailTabs();

const customer = ref<CustomerListItem | null>(null);
const credit = ref<CustomerCredit | null>(null);
const outstandingBalance = ref<OutstandingBalance | null>(null);
const managers = ref<ManagerOption[]>([]);
const branches = ref<BranchOption[]>([]);
// The Vendure Customer id, distinct from the counterparty id; visibleOrders(customerId: ...) needs it.
const vendureCustomerId = ref<string | null>(null);
// Fetched here for the header summary and refreshed by the Team tab's own @loaded emit.
const teamMembers = ref<CounterpartyTeamMember[]>([]);
const historyRefs = ref<EntityRef[]>([]);
const loading = ref(true);
const notFound = ref(false);

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

        if (authStore.hasPermission('ReadEntityHistory')) {
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
</script>

<template>
    <div v-if="notFound" class="customer-detail__not-found">
        <h1>{{ t('customers.detail.notFound') }}</h1>
        <RouterLink to="/customers">{{ t('customers.detail.backToCustomers') }}</RouterLink>
    </div>

    <!-- First load only; later refetches fall through to the panel's own `v-if="!loading"` gap. -->
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

        <CustomerInfoRow
            :customer="customer"
            :credit="credit"
            :managers="managers"
            :branches="branches"
            :team-members="teamMembers"
        />

        <CustomerMetricsKpis
            v-if="!loading"
            :counterparty-id="String(route.params.id)"
            :unpaid-proforma-minor="outstandingBalance?.amount ?? 0"
            :available-credit="credit ? credit.creditLimit - credit.creditBalance : null"
        />

        <CustomerTabBar
            :primary-tabs="primaryTabs"
            :overflow-tabs="overflowTabs"
            :active-tab="activeTab"
            @select="selectTab"
        />

        <MvPanel v-if="!loading">
            <CustomerTabContent
                :tab="activeTab"
                :customer="customer"
                :credit="credit"
                :managers="managers"
                :vendure-customer-id="vendureCustomerId"
                :history-refs="historyRefs"
                @changed="load"
                @team-loaded="teamMembers = $event"
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

.customer-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary);
}
</style>
