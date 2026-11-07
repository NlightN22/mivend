<script setup lang="ts">
import { MvFlaggedValue, MvStatusBadge } from '@mivend/ui-kit';
import type { AdjustmentInfo } from '../../utils/orderLineRows';

defineProps<{ price: string; belowFloor: boolean; adjustment: AdjustmentInfo | null }>();
</script>

<template>
    <div class="line-price">
        <MvFlaggedValue
            v-if="belowFloor"
            severity="danger"
            tooltip="Price is below the allowed minimum"
        >
            {{ price }}
        </MvFlaggedValue>
        <span v-else>{{ price }}</span>
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
