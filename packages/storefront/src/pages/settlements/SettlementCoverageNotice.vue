<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvNotice } from '@mivend/ui-kit';
import { formatMoney } from '../../i18n/format';
import type { CoverageGap } from './settlementCoverage';
import { toMajor } from './useSettlementDocuments';

defineProps<{ gaps: readonly CoverageGap[] }>();
const { t } = useI18n();
</script>

<template>
    <div v-if="gaps.length" class="settlement-coverage">
        <MvNotice v-for="g in gaps" :key="g.currency" variant="info">
            <i18n-t keypath="settlements.coverage.text" tag="span">
                <template #amount>{{ formatMoney(toMajor(g.unexplained), g.currency) }}</template>
                <template #link>
                    <RouterLink to="/reconciliation-acts">{{
                        t('settlements.coverage.link')
                    }}</RouterLink>
                </template>
            </i18n-t>
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
