<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import type { AdjustmentInfo } from '../../utils/orderLineRows';

defineProps<{ price: string; adjustment: AdjustmentInfo | null }>();
</script>

<template>
    <div class="line-price">
        <span>{{ price }}</span>
        <RouterLink
            v-if="adjustment?.approvalRequestId"
            :to="`/approvals/${adjustment.approvalRequestId}`"
        >
            <MvStatusBadge :variant="adjustment.variant">{{ adjustment.label }}</MvStatusBadge>
        </RouterLink>
        <MvStatusBadge v-else-if="adjustment" :variant="adjustment.variant">
            {{ adjustment.label }}
        </MvStatusBadge>
    </div>
</template>

<style scoped>
.line-price {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
}
</style>
