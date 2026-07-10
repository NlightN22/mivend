<script setup lang="ts">
import { computed, ref } from 'vue';
import { MvStatusBadge } from '@mivend/ui-kit';
import type { OrderDetailLine, PriceAdjustmentRequestSummary } from '../../api/orderDetail';
import PriceAdjustmentPanel from '../order-create/PriceAdjustmentPanel.vue';

const props = defineProps<{
    orderId: string;
    lines: OrderDetailLine[];
    currencyCode: string;
    editable: boolean;
    adjustmentRequests: PriceAdjustmentRequestSummary[];
}>();
const emit = defineEmits<{ adjusted: [] }>();

const openAdjustLineId = ref<string | null>(null);

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: props.currencyCode }).format(
        amount / 100,
    );
}

interface AdjustmentInfo {
    label: string;
    variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
    approvalRequestId: string | null;
}

const adjustmentByLineId = computed(() => {
    const map = new Map<string, AdjustmentInfo>();
    for (const request of props.adjustmentRequests) {
        let payload: { orderLineId?: string };
        try {
            payload = JSON.parse(request.payload) as { orderLineId?: string };
        } catch {
            continue;
        }
        if (!payload.orderLineId) continue;
        if (request.status === 'pending') {
            map.set(payload.orderLineId, {
                label: 'Pending approval',
                variant: 'warning',
                approvalRequestId: request.id,
            });
        } else if (request.status === 'approved' && !map.has(payload.orderLineId)) {
            map.set(payload.orderLineId, {
                label: 'Approved adjustment',
                variant: 'success',
                approvalRequestId: request.id,
            });
        }
    }
    for (const line of props.lines) {
        if (map.has(line.id)) continue;
        if (line.customFields.manualUnitPrice !== null) {
            map.set(line.id, { label: 'Self-service adjustment', variant: 'info', approvalRequestId: null });
        }
    }
    return map;
});

function toggleAdjust(lineId: string): void {
    openAdjustLineId.value = openAdjustLineId.value === lineId ? null : lineId;
}
</script>

<template>
    <table class="order-lines">
        <thead>
            <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Adjustment</th>
                <th v-if="editable"></th>
                <th>Line total</th>
            </tr>
        </thead>
        <tbody>
            <template v-for="line in lines" :key="line.id">
                <tr>
                    <td>{{ line.productVariant.sku }}</td>
                    <td>{{ line.productVariant.name }}</td>
                    <td>{{ line.quantity }}</td>
                    <td>{{ money(line.unitPriceWithTax) }}</td>
                    <td>
                        <RouterLink
                            v-if="adjustmentByLineId.get(line.id)?.approvalRequestId"
                            :to="`/approvals/${adjustmentByLineId.get(line.id)?.approvalRequestId}`"
                        >
                            <MvStatusBadge :variant="adjustmentByLineId.get(line.id)!.variant">
                                {{ adjustmentByLineId.get(line.id)?.label }}
                            </MvStatusBadge>
                        </RouterLink>
                        <MvStatusBadge v-else-if="adjustmentByLineId.get(line.id)" :variant="adjustmentByLineId.get(line.id)!.variant">
                            {{ adjustmentByLineId.get(line.id)?.label }}
                        </MvStatusBadge>
                    </td>
                    <td v-if="editable">
                        <button type="button" class="order-lines__adjust" @click="toggleAdjust(line.id)">
                            Adjust price
                        </button>
                    </td>
                    <td>{{ money(line.linePriceWithTax) }}</td>
                </tr>
                <tr v-if="openAdjustLineId === line.id">
                    <td :colspan="editable ? 7 : 6">
                        <PriceAdjustmentPanel
                            :order-id="orderId"
                            :line="line"
                            @applied="
                                () => {
                                    emit('adjusted');
                                    openAdjustLineId = null;
                                }
                            "
                            @close="openAdjustLineId = null"
                        />
                    </td>
                </tr>
            </template>
        </tbody>
    </table>
</template>

<style scoped>
.order-lines {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.order-lines th {
    text-align: left;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    padding: 8px 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.order-lines td {
    padding: 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.order-lines__adjust {
    background: none;
    border: none;
    color: var(--el-color-primary-dark-2, #008a70);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}
</style>
