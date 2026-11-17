<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvPanel } from '@mivend/ui-kit';
import type { ManagerCard } from '../../api/managerCard';
import { useCurrency } from '../../composables/useCurrency';
import { sharePercent } from './managerCardFormat';

const props = defineProps<{ card: ManagerCard }>();

const { t } = useI18n();
const { formatMinor } = useCurrency();
const receivables = computed(() => props.card.receivables);
const buckets = computed(() => [
    ['notDue', receivables.value.aging.notDueMinor],
    ['d1to30', receivables.value.aging.overdue1to30Minor],
    ['d31to60', receivables.value.aging.overdue31to60Minor],
    ['over60', receivables.value.aging.overdueOver60Minor],
]);
</script>

<template>
    <MvPanel class="manager-panel">
        <h2 class="manager-panel__title">{{ t('managerCard.receivables.title') }}</h2>
        <p v-if="receivables.debtMinor === 0" class="manager-panel__empty">
            {{ t('managerCard.receivables.empty') }}
        </p>
        <template v-else>
            <div class="manager-panel__figures">
                <div>
                    <span class="manager-panel__label">{{
                        t('managerCard.receivables.debt')
                    }}</span>
                    <strong>{{ formatMinor(receivables.debtMinor) }}</strong>
                </div>
                <div>
                    <span class="manager-panel__label">{{
                        t('managerCard.receivables.overdue')
                    }}</span>
                    <strong>{{ formatMinor(receivables.overdueMinor) }}</strong>
                    <small>
                        {{
                            t('managerCard.receivables.overdueShare', {
                                percent: sharePercent(
                                    receivables.overdueMinor,
                                    receivables.debtMinor,
                                ),
                            })
                        }}
                    </small>
                </div>
            </div>
            <h3 class="manager-panel__subtitle">{{ t('managerCard.receivables.aging') }}</h3>
            <ul class="manager-panel__list">
                <li v-for="[key, amount] in buckets" :key="String(key)">
                    <span>{{ t(`managerCard.receivables.${key}`) }}</span>
                    <span>{{ formatMinor(Number(amount)) }}</span>
                </li>
            </ul>
            <h3 class="manager-panel__subtitle">{{ t('managerCard.receivables.topDebtors') }}</h3>
            <ul class="manager-panel__list">
                <li v-for="d in receivables.topDebtors" :key="d.counterpartyId">
                    <RouterLink :to="`/customers/${d.counterpartyId}`">{{ d.name }}</RouterLink>
                    <span>
                        {{ formatMinor(d.debtMinor) }}
                        <small v-if="d.overdueMinor > 0">
                            · {{ t('managerCard.receivables.overdue') }}
                            {{ formatMinor(d.overdueMinor) }}
                        </small>
                    </span>
                </li>
            </ul>
        </template>
    </MvPanel>
</template>
