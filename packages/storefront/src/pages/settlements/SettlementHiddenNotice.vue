<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvNotice } from '@mivend/ui-kit';
import { formatMoney } from '../../i18n/format';
import { toMajor, type SettlementHidden } from './useSettlementDocuments';

defineProps<{ summary: readonly SettlementHidden[] }>();
const { t } = useI18n();
</script>

<template>
    <div v-if="summary.some(s => s.count > 0)" class="settlement-hidden">
        <MvNotice v-for="s in summary.filter(x => x.count > 0)" :key="s.currency" variant="info">
            {{
                t(
                    'settlements.hidden',
                    { n: s.count, amount: formatMoney(toMajor(Number(s.netAmount)), s.currency) },
                    s.count,
                )
            }}
        </MvNotice>
    </div>
</template>

<style scoped>
.settlement-hidden {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
}
</style>
