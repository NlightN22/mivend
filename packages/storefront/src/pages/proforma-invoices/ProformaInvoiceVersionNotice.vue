<script setup lang="ts">
import { MvNotice } from '@mivend/ui-kit';
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
</script>

<template>
    <div class="version-notices">
        <MvNotice v-if="supersededBy" variant="info">
            There is a newer version v{{ supersededBy.version }} (№ {{ supersededBy.number }}).
            <RouterLink :to="`/proforma-invoices/${supersededBy.id}`"
                >Open newer version</RouterLink
            >
        </MvNotice>
        <MvNotice v-else-if="supersedes" variant="info">
            Version {{ version }}, follows № {{ supersedes.number }}.
            <RouterLink :to="`/proforma-invoices/${supersedes.id}`"
                >Open previous version</RouterLink
            >
        </MvNotice>
        <MvNotice v-if="orderChangedDifference != null" variant="warning">
            The order changed after payment, difference
            {{ formatMoney(orderChangedDifference, currencyCode) }}. It is settled through the ERP;
            this proforma invoice stays unchanged.
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
