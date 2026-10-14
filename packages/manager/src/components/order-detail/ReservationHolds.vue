<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { MvStatusBadge } from '@mivend/ui-kit';
import { fetchOrderReservationDetails, type OrderReservationDetail } from '../../api/reservation';

const props = defineProps<{ orderId: string; refreshOn: unknown }>();
const details = ref<OrderReservationDetail[]>([]);

async function load(): Promise<void> {
    details.value = await fetchOrderReservationDetails(props.orderId);
}

onMounted(load);
watch(() => props.refreshOn, load);

function until(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString('en-US') : '—';
}
</script>

<template>
    <div v-if="details.length" class="reservation-holds">
        <div class="reservation-holds__title">Holds by line</div>
        <div
            v-for="hold in details"
            :key="`${hold.source}-${hold.orderLineId}-${hold.status}-${until(hold.until)}`"
            class="reservation-holds__row"
        >
            <span class="reservation-holds__sku">{{ hold.sku }}</span>
            <MvStatusBadge :variant="hold.source === 'LOCAL' ? 'info' : 'warning'">
                {{ hold.source === 'LOCAL' ? 'Our reservation' : 'ERP reservation' }}
            </MvStatusBadge>
            <span class="reservation-holds__qty">× {{ hold.quantity }}</span>
            <span class="reservation-holds__meta"
                >{{ hold.status }} · until {{ until(hold.until) }}</span
            >
        </div>
    </div>
</template>

<style scoped>
.reservation-holds {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.reservation-holds__title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary, #6b7280);
}
.reservation-holds__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid #edf2ef;
    font-size: 13px;
}
.reservation-holds__sku {
    font-weight: 700;
}
.reservation-holds__meta {
    margin-left: auto;
    color: #66736e;
}
</style>
