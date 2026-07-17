<script setup lang="ts">
import { useRouter } from 'vue-router';
import { MvButton } from '@mivend/ui-kit';
import InvoicesTable from '../invoices/InvoicesTable.vue';
import type { InvoiceListItem } from '../../api/invoices';

const props = defineProps<{ invoices: InvoiceListItem[]; counterpartyId: string }>();
const router = useRouter();

function viewAll(): void {
    router.push({ path: '/invoices', query: { counterpartyId: props.counterpartyId } });
}
</script>

<template>
    <div class="customer-invoices-tab">
        <InvoicesTable :invoices="props.invoices" :counterparty-names="new Map()" compact :page-size="5" />
        <MvButton size="sm" variant="ghost" @click="viewAll">View all invoices</MvButton>
    </div>
</template>

<style scoped>
.customer-invoices-tab {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
</style>
