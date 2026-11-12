<script setup lang="ts">
import { MvNotice } from '@mivend/ui-kit';
import { formatMoney } from '../../i18n/format';
import type { CoverageGap } from './settlementCoverage';
import { toMajor } from './useSettlementDocuments';

defineProps<{ gaps: readonly CoverageGap[] }>();
</script>

<template>
    <div v-if="gaps.length" class="settlement-coverage">
        <MvNotice v-for="g in gaps" :key="g.currency" variant="info">
            {{ $t('settlements.coverage.text', { amount: formatMoney(toMajor(g.unexplained), g.currency) }) }}
        </MvNotice>
    </div>
</template>

<style scoped>
.settlement-coverage {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
}
</style>
