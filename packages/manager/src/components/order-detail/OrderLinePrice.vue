<script setup lang="ts">
import { MvFlagChip, MvPopover } from '@mivend/ui-kit';
import type { AdjustmentInfo } from '../../utils/orderLineRows';

defineProps<{ price: string; adjustment: AdjustmentInfo | null }>();
</script>

<template>
    <div class="line-price">
        <span>{{ price }}</span>
        <span v-if="adjustment && adjustment.label !== 'Pending approval'" @click.stop>
            <MvPopover>
                <template #trigger>
                    <MvFlagChip tone="info" :label="adjustment.label" />
                </template>
                <span>{{ adjustment.label }}</span>
                <RouterLink
                    v-if="adjustment.approvalRequestId"
                    :to="`/approvals/${adjustment.approvalRequestId}`"
                >
                    Open the approval request
                </RouterLink>
            </MvPopover>
        </span>
    </div>
</template>

<style scoped>
.line-price {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
</style>
