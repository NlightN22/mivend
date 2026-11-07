<script setup lang="ts">
import { computed } from 'vue';
import { MvNotice, MvStatusBadge } from '@mivend/ui-kit';
import type { OrderReservation } from '../../api/reservation';

const props = defineProps<{ reservations: OrderReservation[] }>();

const active = computed(() => props.reservations.filter(r => r.status === 'active'));
// All lines share one expiresAt (see ReservationService.confirmOrder), so any active row works.
const expiresAt = computed(() => active.value[0]?.expiresAt ?? null);
</script>

<template>
    <div v-if="active.length" class="reservation-panel">
        <MvStatusBadge variant="success">Reserved</MvStatusBadge>
        <span class="reservation-panel__expiry">
            Until {{ expiresAt ? new Date(expiresAt).toLocaleString('en-US') : '—' }}
        </span>
    </div>
    <MvNotice v-else variant="info">
        Not confirmed yet — stock is not reserved for this order.
    </MvNotice>
</template>

<style scoped>
.reservation-panel {
    display: flex;
    align-items: center;
    gap: 10px;
}

.reservation-panel__expiry {
    font-size: 13px;
    color: var(--app-text-grey);
}
</style>
