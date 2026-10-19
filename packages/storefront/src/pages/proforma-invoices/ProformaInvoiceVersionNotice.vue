<script setup lang="ts">
import { MvNotice } from '@mivend/ui-kit';
import { useI18n } from 'vue-i18n';
import { formatMoney } from './formatMoney';

export interface VersionRef {
    id: string;
    number: string;
    version: number;
}

defineProps<{
    version: number;
    currencyCode: string;
    supersedes?: VersionRef | null;
    supersededBy?: VersionRef | null;
    orderChangedDifference?: number | null;
}>();

const { t } = useI18n();
</script>

<template>
    <div class="version-notices">
        <MvNotice v-if="supersededBy" variant="info">
            {{
                t('proformaInvoices.newerVersion', {
                    version: supersededBy.version,
                    number: supersededBy.number,
                })
            }}.
            <RouterLink :to="`/proforma-invoices/${supersededBy.id}`">{{
                t('proformaInvoices.openNewer')
            }}</RouterLink>
        </MvNotice>
        <MvNotice v-else-if="supersedes" variant="info">
            {{ t('proformaInvoices.follows', { version, number: supersedes.number }) }}
            <RouterLink :to="`/proforma-invoices/${supersedes.id}`">{{
                t('proformaInvoices.openPrevious')
            }}</RouterLink>
        </MvNotice>
        <MvNotice v-if="orderChangedDifference != null" variant="warning">
            {{
                t('proformaInvoices.orderChanged', {
                    difference: formatMoney(orderChangedDifference, currencyCode),
                })
            }}
        </MvNotice>
    </div>
</template>

<style scoped>
.version-notices {
    display: grid;
    gap: 8px;
    margin-bottom: 16px;
}
</style>
