<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import type { ManagerCard } from '../../api/managerCard';
import { formatDate } from '../../i18n/format';

const HISTORY_DAYS = 365 + 30;

const props = defineProps<{ card: ManagerCard }>();

const { t } = useI18n();
const ROWS = ['active', 'newCustomers', 'returned', 'lost'] as const;
const columns = computed(
    () =>
        [
            ['now', props.card.dynamics.current],
            ['prevPeriod', props.card.dynamics.previous],
            ['prevYear', props.card.dynamics.previousYear],
        ] as const,
);
// The year-back comparison needs 12 months plus the 30-day window of history behind it.
const incomplete = computed(() => {
    const start = props.card.dynamics.historyStartsAt;
    if (start === null) return false;
    const needed = new Date(props.card.computedAt).getTime() - HISTORY_DAYS * 86_400_000;
    return Date.parse(start) > needed;
});
</script>

<template>
    <MvPanel class="manager-panel">
        <h2 class="manager-panel__title">{{ t('managerCard.dynamics.title') }}</h2>
        <p class="manager-panel__hint">{{ t('managerCard.dynamics.hint') }}</p>
        <table class="manager-panel__table">
            <thead>
                <tr>
                    <th />
                    <th v-for="[key] in columns" :key="key">
                        {{ t(`managerCard.dynamics.${key}`) }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in ROWS" :key="row">
                    <th scope="row">{{ t(`managerCard.dynamics.${row}`) }}</th>
                    <td v-for="[key, point] in columns" :key="key">{{ point[row] }}</td>
                </tr>
            </tbody>
        </table>
        <MvNotice v-if="incomplete" variant="info">
            {{
                t('managerCard.dynamics.noHistory', {
                    date: formatDate(card.dynamics.historyStartsAt ?? ''),
                })
            }}
        </MvNotice>
    </MvPanel>
</template>
