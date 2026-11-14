<script setup lang="ts">
import { formatDate } from '../../i18n/format';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvPanel, MvKpiCard, MvKpiCarousel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useCurrency } from '../../composables/useCurrency';
import {
    fetchCustomersSummary,
    fetchHighUsageCustomers,
    fetchCounterpartyNames,
    fetchCreditLimitExceededCounterpartyIds,
    type CustomersSummary,
    type HighUsageCustomer,
} from '../../api/customers';
import { fetchExpiringDiscountGrants } from '../../api/discounts';
import CustomersList from '../../components/customers/CustomersList.vue';
import NeedsAttentionPanel, {
    type AttentionEntry,
} from '../../components/customers/NeedsAttentionPanel.vue';

const { t } = useI18n();
const authStore = useAuthStore();
// "My Clients" only makes sense for Manager, whose list is their own assigned book — every
// other role sees a department/company-wide list, so the generic title fits better there.
const title = computed(() =>
    t(authStore.roleCode === 'manager' ? 'customers.page.titleManager' : 'customers.page.title'),
);

const { formatWhole } = useCurrency();

// KPIs and "Needs attention" come from dedicated summary/top-N backend queries: they must
// reflect the FULL visible set, not the list's current page or filter.
const expiringGrantsByCustomerId = ref<Map<string, string>>(new Map());
const expiringNames = ref<Map<string, string>>(new Map());
const summary = ref<CustomersSummary | null>(null);
const highUsageCustomers = ref<HighUsageCustomer[]>([]);
const creditExceededCustomers = ref<Map<string, string>>(new Map());

// Same window used by the dashboard's discount banner.
const EXPIRING_SOON_DAYS = 14;
const ATTENTION_TOP_N = 5;

const activeClientsCount = computed(() => summary.value?.activeCount ?? 0);
// Null (not 0) means "no ReadCounterpartyCredit": hide the card rather than show a misleading zero.
const canReadCredit = computed(() => summary.value?.totalCreditBalance != null);
const totalCreditBalance = computed(() => summary.value?.totalCreditBalance ?? 0);
const highUsageCount = computed(() => summary.value?.highUsageCount ?? 0);
const expiringGrantsCount = ref(0);

const attentionItems = computed<AttentionEntry[]>(() => {
    const highUsage: AttentionEntry[] = highUsageCustomers.value.map(c => {
        const percent = c.creditLimit > 0 ? Math.round((c.creditBalance / c.creditLimit) * 100) : 0;
        return {
            customerId: c.id,
            title: c.shortName,
            meta: t('customers.page.attention.highUsage', { percent }),
            tag: t('customers.page.attention.riskTag'),
            variant: 'danger',
        };
    });
    const expiring: AttentionEntry[] = [...expiringGrantsByCustomerId.value.entries()]
        .slice(0, ATTENTION_TOP_N)
        .map(([customerId, validTo]) => ({
            customerId,
            title: expiringNames.value.get(customerId) ?? '—',
            meta: t('customers.page.attention.expiring', { date: formatDate(validTo) }),
            tag: t('customers.page.attention.discountsTag'),
            variant: 'warning',
        }));
    const exceeded: AttentionEntry[] = [...creditExceededCustomers.value.entries()].map(
        ([customerId, name]) => ({
            customerId,
            title: name,
            meta: t('customers.page.attention.exceeded'),
            tag: t('customers.page.attention.creditTag'),
            variant: 'danger',
        }),
    );
    return [...exceeded, ...highUsage, ...expiring];
});

onMounted(async () => {
    const [expiringGrants, summaryResult, highUsage, exceededIds] = await Promise.all([
        fetchExpiringDiscountGrants(EXPIRING_SOON_DAYS),
        fetchCustomersSummary(),
        fetchHighUsageCustomers(ATTENTION_TOP_N),
        fetchCreditLimitExceededCounterpartyIds(),
    ]);
    summary.value = summaryResult;
    highUsageCustomers.value = highUsage;
    creditExceededCustomers.value = await fetchCounterpartyNames(
        exceededIds.slice(0, ATTENTION_TOP_N),
    );
    const grantsMap = new Map<string, string>();
    expiringGrantsCount.value = expiringGrants.totalItems;
    for (const grant of expiringGrants.items) {
        for (const cp of grant.counterparties) {
            if (!grantsMap.has(cp.id)) grantsMap.set(cp.id, grant.validTo);
        }
    }
    expiringGrantsByCustomerId.value = grantsMap;
    expiringNames.value = await fetchCounterpartyNames(
        [...grantsMap.keys()].slice(0, ATTENTION_TOP_N),
    );
});
</script>

<template>
    <div class="customers-page">
        <div class="customers-page__header">
            <div class="customers-page__breadcrumb">{{ t('customers.page.breadcrumb') }}</div>
            <h1 class="customers-page__title">{{ title }}</h1>
        </div>

        <MvKpiCarousel v-if="summary" class="customers-page__kpis">
            <MvKpiCard :label="t('customers.page.kpi.activeClients')" :value="activeClientsCount" />
            <MvKpiCard
                v-if="canReadCredit"
                :label="t('customers.page.kpi.creditUsed')"
                :value="formatWhole(totalCreditBalance)"
                :caption="
                    t(
                        'customers.page.kpi.creditUsedCaption',
                        { count: highUsageCount },
                        highUsageCount,
                    )
                "
                accent
            />
            <MvKpiCard
                :label="t('customers.page.kpi.expiringDiscounts')"
                :value="expiringGrantsCount"
                accent
                to="/discounts?source=requests"
            />
        </MvKpiCarousel>

        <CustomersList />

        <MvPanel :title="t('customers.page.attention.title')">
            <NeedsAttentionPanel :items="attentionItems" />
        </MvPanel>
    </div>
</template>

<style scoped>
.customers-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.customers-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.customers-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .customers-page__breadcrumb {
        display: none;
    }

    .customers-page__title {
        font-size: 22px;
    }
}
</style>
