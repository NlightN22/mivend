<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvTooltip } from '@mivend/ui-kit';
import type { LineCheckView } from '../../utils/orderLineChecks';
import type { OrderLineAvailability } from '../../api/orderLineEdit';
import OrderLineOrgList from './OrderLineOrgList.vue';
import OrderLineStockSources from './OrderLineStockSources.vue';

const { t } = useI18n();
defineProps<{ view: LineCheckView; sources: OrderLineAvailability | null }>();
</script>

<template>
    <MvTooltip trigger="hover" placement="bottom">
        <template #trigger>
            <span class="stock-info" tabindex="0">{{ view.available ?? '—' }}</span>
        </template>
        <p class="stock-info__head">
            {{
                t('orderLines.line.availableStock', {
                    available: view.available ?? '—',
                    needed: view.needed,
                })
            }}
        </p>
        <OrderLineStockSources v-if="sources" :availability="sources" />
        <OrderLineOrgList v-else-if="view.orgRows.length" :rows="view.orgRows" mode="stock" />
    </MvTooltip>
</template>

<style scoped>
.stock-info {
    cursor: help;
}

.stock-info__head {
    margin: 0 0 4px;
    font-weight: 700;
}
</style>
