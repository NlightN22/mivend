<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import {
    fetchVariantReservationHolders,
    type VariantReservationHolder,
} from '../../api/reservation';

const props = defineProps<{ productVariantId: string }>();
const holders = ref<VariantReservationHolder[]>([]);

function until(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString('en-US') : '—';
}

onMounted(async () => {
    holders.value = await fetchVariantReservationHolders(props.productVariantId);
});
</script>

<template>
    <div v-if="holders.length" class="holders">
        <h2 class="holders__title">Who holds reserves</h2>
        <table class="holders__table">
            <thead>
                <tr>
                    <th>Order</th>
                    <th>Counterparty</th>
                    <th>Manager</th>
                    <th>Source</th>
                    <th>Qty</th>
                    <th>Until</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="holder in holders" :key="`${holder.orderId}-${holder.source}`">
                    <td>
                        <RouterLink :to="`/orders/${holder.orderCode}`">{{
                            formatDocumentNumber(holder.orderCode)
                        }}</RouterLink>
                    </td>
                    <td>{{ holder.counterpartyName ?? '—' }}</td>
                    <td>{{ holder.managerName ?? '—' }}</td>
                    <td>
                        <MvStatusBadge :variant="holder.source === 'LOCAL' ? 'info' : 'warning'">
                            {{ holder.source === 'LOCAL' ? 'Our' : 'ERP' }}
                        </MvStatusBadge>
                    </td>
                    <td>{{ holder.quantity }}</td>
                    <td>{{ until(holder.until) }}</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.holders__title {
    margin: 0 0 8px;
    font-size: 16px;
}
.holders__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.holders__table th {
    text-align: left;
    padding: 6px 8px;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}
.holders__table td {
    padding: 8px;
    border-top: 1px solid #edf2ef;
}
</style>
