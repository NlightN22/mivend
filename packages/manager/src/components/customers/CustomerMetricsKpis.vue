<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvKpiCard, MvKpiCarousel, MvPanel, MvSkeleton } from '@mivend/ui-kit';
import { fetchCounterpartyMetrics, type CounterpartyMetrics } from '../../api/counterpartyMetrics';
import { useCurrency } from '../../composables/useCurrency';
import {
    balanceCaption,
    contractLabel,
    dynamicsText,
    formatComputedAt,
} from './customerMetricsFormat';

const props = defineProps<{
    counterpartyId: string;
    unpaidProformaMinor: number;
    availableCredit: number | null;
}>();

const { t } = useI18n();
const { formatMinor, formatWhole } = useCurrency();
const metrics = ref<CounterpartyMetrics | null>(null);
const loading = ref(true);
const failed = ref(false);
let seq = 0;

async function load(id: string): Promise<void> {
    const mine = (seq += 1);
    loading.value = true;
    failed.value = false;
    try {
        const result = await fetchCounterpartyMetrics(id);
        if (mine === seq) metrics.value = result;
    } catch {
        if (mine === seq) failed.value = true;
    } finally {
        if (mine === seq) loading.value = false;
    }
}

watch(() => props.counterpartyId, load, { immediate: true });

const otherBalances = (m: CounterpartyMetrics): string =>
    m.balances
        .filter(b => b.currency !== m.currency)
        .map(b => `${formatMinor(b.amountMinor)} ${b.currency}`)
        .join(', ');
</script>

<template>
    <div v-if="loading" class="customer-metrics__skeleton">
        <MvSkeleton v-for="i in 4" :key="i" height="84px" radius="12px" />
    </div>
    <p v-else-if="failed" class="customer-metrics__note" role="alert">
        {{ t('customers.metrics.loadFailed') }}
    </p>
    <template v-else>
        <MvKpiCarousel class="customer-metrics__kpis">
            <MvKpiCard
                v-if="metrics"
                :label="t('customers.metrics.balance')"
                :value="formatMinor(metrics.balanceMinor)"
                :caption="`${balanceCaption(metrics.balanceMinor)}, ${metrics.currency}`"
                :accent="metrics.balanceMinor < 0"
            />
            <MvKpiCard
                v-if="metrics"
                :label="t('customers.metrics.turnover30')"
                :value="formatMinor(metrics.salesLast30DaysMinor)"
                :caption="
                    dynamicsText(metrics.salesLast30DaysMinor, metrics.salesPrev30DaysMinor) ??
                    metrics.currency
                "
            />
            <MvKpiCard
                v-if="metrics"
                :label="t('customers.metrics.turnover12m')"
                :value="formatMinor(metrics.salesLast12MonthsMinor)"
                :caption="metrics.currency"
            />
            <MvKpiCard
                v-if="metrics"
                :label="t('customers.metrics.averageCheck')"
                :value="
                    metrics.averageCheckMinor === null
                        ? '—'
                        : formatMinor(metrics.averageCheckMinor)
                "
                :caption="t('customers.metrics.perSalesDocument')"
            />
            <MvKpiCard
                v-if="metrics"
                :label="t('customers.metrics.openOrders')"
                :value="metrics.openOrdersCount"
            />
            <MvKpiCard
                :label="t('customers.metrics.unpaidProforma')"
                :value="formatMinor(unpaidProformaMinor)"
            />
            <MvKpiCard
                v-if="availableCredit !== null"
                :label="t('customers.metrics.availableCredit')"
                :value="formatWhole(availableCredit)"
            />
        </MvKpiCarousel>
        <p v-if="!metrics" class="customer-metrics__note" role="status">
            {{ t('customers.metrics.unavailable') }}
        </p>
        <p v-else-if="otherBalances(metrics)" class="customer-metrics__note">
            {{ t('customers.metrics.otherBalances', { balances: otherBalances(metrics) }) }}
        </p>
        <MvPanel v-if="metrics && metrics.contractBalances.length" class="customer-metrics__panel">
            <details>
                <summary>
                    {{
                        t('customers.metrics.byContract', {
                            count: metrics.contractBalances.length,
                        })
                    }}
                </summary>
                <ul class="customer-metrics__list">
                    <li v-for="(row, i) in metrics.contractBalances" :key="i">
                        <span class="customer-metrics__name">
                            {{ contractLabel(row) }}
                            <small v-if="!row.contractName">
                                {{ t('customers.metrics.contractNotImported') }}</small
                            >
                        </span>
                        <span>{{ formatMinor(row.closingBalanceMinor) }}</span>
                    </li>
                </ul>
            </details>
        </MvPanel>
        <p v-if="metrics" class="customer-metrics__note">
            {{ t('customers.metrics.calculated', { date: formatComputedAt(metrics.computedAt) }) }}
        </p>
    </template>
</template>

<style scoped>
.customer-metrics__kpis {
    margin-top: 4px;
}

.customer-metrics__skeleton {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-top: 4px;
}

.customer-metrics__list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.customer-metrics__list li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.customer-metrics__name {
    min-width: 0;
    overflow-wrap: anywhere;
}

.customer-metrics__note {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

@media (max-width: 800px) {
    .customer-metrics__skeleton {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
