<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvKpiCard, MvKpiCarousel } from '@mivend/ui-kit';
import type { ManagerCard } from '../../api/managerCard';
import { useCurrency } from '../../composables/useCurrency';
import { deltaText } from './managerCardFormat';

defineProps<{ card: ManagerCard }>();

const { t } = useI18n();
const { formatMinor } = useCurrency();
</script>

<template>
    <MvKpiCarousel>
        <MvKpiCard
            :label="t('managerCard.kpi.sales30')"
            :value="formatMinor(card.sales.last30.currentMinor)"
            :caption="
                deltaText(
                    card.sales.last30.currentMinor,
                    card.sales.last30.previousMinor,
                    'vsPrevious',
                ) ?? card.currency
            "
        />
        <MvKpiCard
            :label="t('managerCard.kpi.salesMonth')"
            :value="formatMinor(card.sales.monthToDayVsPrevMonth.currentMinor)"
            :caption="
                [
                    deltaText(
                        card.sales.monthToDayVsPrevMonth.currentMinor,
                        card.sales.monthToDayVsPrevMonth.previousMinor,
                        'vsPrevMonth',
                    ),
                    deltaText(
                        card.sales.monthToDayVsPrevYear.currentMinor,
                        card.sales.monthToDayVsPrevYear.previousMinor,
                        'vsPrevYear',
                    ),
                ]
                    .filter(Boolean)
                    .join(' · ') || card.currency
            "
        />
        <MvKpiCard
            :label="t('managerCard.kpi.salesYear')"
            :value="formatMinor(card.sales.yearToDay.currentMinor)"
            :caption="
                deltaText(
                    card.sales.yearToDay.currentMinor,
                    card.sales.yearToDay.previousMinor,
                    'vsPrevYear',
                ) ?? card.currency
            "
        />
        <MvKpiCard
            :label="t('managerCard.kpi.averageCheck')"
            :value="
                card.sales.averageCheckMinor === null
                    ? '—'
                    : formatMinor(card.sales.averageCheckMinor)
            "
            :caption="t('managerCard.kpi.perSalesDocument')"
        />
        <MvKpiCard :label="t('managerCard.kpi.customers')" :value="card.customersVisible" />
        <MvKpiCard :label="t('managerCard.kpi.openOrders')" :value="card.openOrders" />
    </MvKpiCarousel>
</template>
