<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvFilterChips, MvPanel, type FilterChip } from '@mivend/ui-kit';
import { computed } from 'vue';
import type { ManagerCard } from '../../api/managerCard';
import { LOST_THRESHOLDS } from '../../api/managerCard';
import { useCurrency } from '../../composables/useCurrency';
import { formatDate } from '../../i18n/format';

const props = defineProps<{ card: ManagerCard }>();
const emit = defineEmits<{ 'update:threshold': [days: number] }>();

const { t } = useI18n();
const { formatMinor } = useCurrency();
const counts = computed<Record<number, number>>(() => ({
    60: props.card.lost.count60,
    90: props.card.lost.count90,
    180: props.card.lost.count180,
}));
const chips = computed<FilterChip[]>(() =>
    LOST_THRESHOLDS.map(days => ({
        key: String(days),
        label: `${t('managerCard.lost.threshold', { days })} ${counts.value[days]}`,
    })),
);
</script>

<template>
    <MvPanel class="manager-panel">
        <h2 class="manager-panel__title">{{ t('managerCard.lost.title') }}</h2>
        <p class="manager-panel__hint">
            {{ t('managerCard.lost.hint', { days: card.lost.thresholdDays }) }}
        </p>
        <MvFilterChips
            :chips="chips"
            :active="String(card.lost.thresholdDays)"
            @select="emit('update:threshold', Number($event))"
        />
        <p v-if="card.lost.rows.length === 0" class="manager-panel__empty">
            {{ t('managerCard.lost.empty') }}
        </p>
        <ul v-else class="manager-panel__list">
            <li v-for="row in card.lost.rows" :key="row.counterpartyId">
                <span>
                    <RouterLink :to="`/customers/${row.counterpartyId}`">{{ row.name }}</RouterLink>
                    <small>
                        · {{ t('managerCard.lost.lastSale') }} {{ formatDate(row.lastSaleDay) }} ({{
                            t('managerCard.lost.idle', { days: row.idleDays })
                        }})
                    </small>
                </span>
                <span>{{ formatMinor(row.turnover12mMinor) }}</span>
            </li>
        </ul>
    </MvPanel>
</template>
