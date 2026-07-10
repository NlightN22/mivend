<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import type { PriceAdjustmentRequestSummary } from '../../api/orderDetail';

defineProps<{ requests: PriceAdjustmentRequestSummary[] }>();

function variant(status: string): 'success' | 'danger' | 'warning' {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'danger';
    return 'warning';
}
</script>

<template>
    <ul class="price-history">
        <li v-for="request in requests" :key="request.id" class="price-history__item">
            <RouterLink :to="`/approvals/${request.id}`" class="price-history__link">
                Price adjustment request #{{ request.id }}
            </RouterLink>
            <MvStatusBadge :variant="variant(request.status)">
                {{ request.status === 'pending' && request.currentStepRole
                    ? `Waiting on ${request.currentStepRole}`
                    : request.status }}
            </MvStatusBadge>
        </li>
    </ul>
</template>

<style scoped>
.price-history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.price-history__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
}

.price-history__link {
    color: var(--el-text-color-primary, #17212b);
    text-decoration: none;
    font-weight: 600;
}

.price-history__link:hover {
    color: var(--el-color-primary-dark-2, #008a70);
}
</style>
