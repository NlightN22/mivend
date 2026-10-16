<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvNotice, MvStatusBadge } from '@mivend/ui-kit';
import { fetchOrderCheckHealth, type OrderCheckHealthRow } from '../../api/integration-health';

const rows = ref<OrderCheckHealthRow[]>([]);
const loaded = ref(false);
const error = ref('');

onMounted(async () => {
    try {
        rows.value = await fetchOrderCheckHealth();
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load ERP requirement counters';
    } finally {
        loaded.value = true;
    }
});
</script>

<template>
    <div class="check-health">
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
        <p v-else-if="loaded && !rows.length" class="check-health__empty">
            No orders currently fail an ERP requirement.
        </p>
        <ul v-else class="check-health__list">
            <li v-for="r in rows" :key="`${r.checkCode}:${r.reason}`" class="check-health__row">
                <span>
                    <strong>{{ r.checkCode }}</strong>
                    <span v-if="r.reason" class="check-health__reason"> · {{ r.reason }}</span>
                </span>
                <span class="check-health__counts">
                    <MvStatusBadge variant="warning">{{ r.orderCount }} orders</MvStatusBadge>
                    <MvStatusBadge v-if="r.staleOrderCount" variant="neutral"
                        >{{ r.staleOrderCount }} out of date</MvStatusBadge
                    >
                </span>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.check-health__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.check-health__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 14px;
}

.check-health__reason,
.check-health__empty {
    color: #6b7280;
    font-size: 13px;
}

.check-health__counts {
    display: flex;
    gap: 8px;
}
</style>
