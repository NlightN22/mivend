<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvFlagChip, MvPopover } from '@mivend/ui-kit';
import type { AdjustmentInfo } from '../../utils/orderLineRows';

const { t } = useI18n();
defineProps<{ price: string; adjustment: AdjustmentInfo | null }>();
</script>

<template>
    <div class="line-price">
        <span>{{ price }}</span>
        <span
            v-if="adjustment && adjustment.label !== t('orderLines.adjustment.pending')"
            @click.stop
        >
            <MvPopover>
                <template #trigger>
                    <MvFlagChip tone="info" :label="adjustment.label" />
                </template>
                <span>{{ adjustment.label }}</span>
                <RouterLink
                    v-if="adjustment.approvalRequestId"
                    :to="`/approvals/${adjustment.approvalRequestId}`"
                >
                    {{ t('orderLines.line.openApproval') }}
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
