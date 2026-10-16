<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvStatusBadge } from '@mivend/ui-kit';
import type { OrderDetailLine, PriceAdjustmentRequestSummary } from '../../api/orderDetail';
import { fetchAvailableStock } from '../../api/reservation';
import { formatLineQuantity } from '../../composables/lineSalesUnit';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { findingsByLine } from '../../utils/orderCheckMessages';
import { lineCheckView, lineReservedQuantity } from '../../utils/orderLineChecks';
import type { OrderReservation } from '../../api/reservation';
import OrderLineCheckCells from './OrderLineCheckCells.vue';
import PriceAdjustmentPanel from '../order-create/PriceAdjustmentPanel.vue';

const props = defineProps<{
    orderId: string;
    lines: OrderDetailLine[];
    currencyCode: string;
    editable: boolean;
    packagesOnly: boolean;
    adjustmentRequests: PriceAdjustmentRequestSummary[];
    findings: OrderCheckFinding[];
    reservations: OrderReservation[];
}>();
const emit = defineEmits<{ adjusted: [] }>();

const openAdjustLineId = ref<string | null>(null);
const availableByVariantId = ref<Map<string, number>>(new Map());
const findingsByLineId = computed(() => findingsByLine(props.findings));

async function loadAvailableStock(): Promise<void> {
    const variantIds = [...new Set(props.lines.map(l => l.productVariant.id))];
    const entries = await Promise.all(
        variantIds.map(async id => [id, await fetchAvailableStock(id, props.orderId)] as const),
    );
    availableByVariantId.value = new Map(entries);
}

onMounted(loadAvailableStock);
watch(() => props.lines, loadAvailableStock);

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: props.currencyCode,
    }).format(amount / 100);
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
            map.set(line.id, {
                label: 'Self-service adjustment',
                variant: 'info',
                approvalRequestId: null,
            });
        }
    }
    return map;
});

function toggleAdjust(lineId: string): void {
    openAdjustLineId.value = openAdjustLineId.value === lineId ? null : lineId;
}
</script>

<template>
    <div class="order-lines__scroll">
        <table class="order-lines">
            <thead>
                <tr>
                    <th rowspan="2">Product</th>
                    <th rowspan="2" class="order-lines__num">Qty</th>
                    <th colspan="2" class="order-lines__group">Stock</th>
                    <th class="order-lines__group">Contract</th>
                    <th class="order-lines__group">Reservation</th>
                    <th rowspan="2" class="order-lines__num">Unit price</th>
                    <th rowspan="2">Adjustment</th>
                    <th rowspan="2" class="order-lines__num">Line total</th>
                </tr>
                <tr>
                    <th class="order-lines__sub">Available</th>
                    <th class="order-lines__sub">Needed</th>
                    <th class="order-lines__sub">Allowed</th>
                    <th class="order-lines__sub">Ordered</th>
                </tr>
            </thead>
            <tbody>
                <template v-for="line in lines" :key="line.id">
                    <tr>
                        <td class="order-lines__product">
                            <strong>{{ line.productVariant.name }}</strong>
                            <span>{{ line.productVariant.sku }}</span>
                        </td>
                        <td class="order-lines__num">
                            {{
                                formatLineQuantity(
                                    line.quantity,
                                    line.productVariant.customFields,
                                    packagesOnly,
                                )
                            }}
                        </td>
                        <OrderLineCheckCells
                            :view="
                                lineCheckView(
                                    line.quantity,
                                    availableByVariantId.get(line.productVariant.id),
                                    findingsByLineId.get(line.id) ?? [],
                                )
                            "
                            :reserved="lineReservedQuantity(reservations, line.id)"
                        />
                        <td class="order-lines__num">{{ money(line.unitPriceWithTax) }}</td>
                        <td>
                            <RouterLink
                                v-if="adjustmentByLineId.get(line.id)?.approvalRequestId"
                                :to="`/approvals/${adjustmentByLineId.get(line.id)?.approvalRequestId}`"
                            >
                                <MvStatusBadge :variant="adjustmentByLineId.get(line.id)!.variant">
                                    {{ adjustmentByLineId.get(line.id)?.label }}
                                </MvStatusBadge>
                            </RouterLink>
                            <MvStatusBadge
                                v-else-if="adjustmentByLineId.get(line.id)"
                                :variant="adjustmentByLineId.get(line.id)!.variant"
                            >
                                {{ adjustmentByLineId.get(line.id)?.label }}
                            </MvStatusBadge>
                            <button
                                v-if="editable"
                                type="button"
                                class="order-lines__adjust"
                                @click="toggleAdjust(line.id)"
                            >
                                Adjust price
                            </button>
                        </td>
                        <td class="order-lines__num">{{ money(line.linePriceWithTax) }}</td>
                    </tr>
                    <tr v-if="openAdjustLineId === line.id">
                        <td colspan="9">
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
    </div>
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

.order-lines__scroll {
    overflow-x: auto;
}

.order-lines__group {
    text-align: center;
    border-left: 1px solid var(--el-border-color, #e4e7ec);
}

.order-lines__num {
    text-align: right;
    white-space: nowrap;
}

.order-lines__sub {
    text-align: center;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
}

.order-lines__product {
    min-width: 160px;
}

.order-lines__product strong,
.order-lines__product span {
    display: block;
}

.order-lines__product span {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}

.order-lines td:not(.order-lines__product):not(.order-lines__num) {
    text-align: center;
}

.order-lines__adjust {
    display: block;
    margin: 2px auto 0;
    background: none;
    border: none;
    color: var(--el-color-primary-dark-2, #008a70);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}
</style>
