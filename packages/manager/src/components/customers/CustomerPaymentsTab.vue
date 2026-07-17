<script setup lang="ts">
import { useRouter } from 'vue-router';
import { MvButton } from '@mivend/ui-kit';
import PaymentsTable from '../payments/PaymentsTable.vue';
import type { PaymentListItem } from '../../api/payments';

const props = defineProps<{ payments: PaymentListItem[]; counterpartyId: string }>();
const router = useRouter();

function viewAll(): void {
    router.push({ path: '/payments', query: { counterpartyId: props.counterpartyId } });
}
</script>

<template>
    <div class="customer-payments-tab">
        <PaymentsTable :payments="props.payments" :counterparty-names="new Map()" compact :page-size="5" />
        <MvButton size="sm" variant="ghost" @click="viewAll">View all payments</MvButton>
    </div>
</template>

<style scoped>
.customer-payments-tab {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
</style>
