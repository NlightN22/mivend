<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvStatusBadge } from '@mivend/ui-kit';
import type { OrderDetailLine, PriceAdjustmentRequestSummary } from '../../api/orderDetail';
import { useOrderLineEdit } from '../../composables/useOrderLineEdit';
import { formatLineQuantity } from '../../composables/lineSalesUnit';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { findingDetail, findingsByLine, findingTitle } from '../../utils/orderCheckMessages';
import {
    isBelowFloor,
    lineCheckView,
    lineReservedQuantity,
    listedFindings,
} from '../../utils/orderLineChecks';
import type { OrderReservation } from '../../api/reservation';
import OrderLineCheckCells from './OrderLineCheckCells.vue';
import OrderLineUnitPrice from './OrderLineUnitPrice.vue';
import PriceAdjustmentPanel from '../order-create/PriceAdjustmentPanel.vue';
import OrderLineEditCell from './OrderLineEditCell.vue';
import OrderLinesEditBar from './OrderLinesEditBar.vue';

const props = defineProps<{
    orderId: string;
    lines: OrderDetailLine[];
    currencyCode: string;
    editable: boolean;
    canEditLines: boolean;
    packagesOnly: boolean;
    adjustmentRequests: PriceAdjustmentRequestSummary[];
    findings: OrderCheckFinding[];
    reservations: OrderReservation[];
}>();
const emit = defineEmits<{ adjusted: [] }>();

const openAdjustLineId = ref<string | null>(null);
const findingsByLineId = computed(() => findingsByLine(props.findings));
const orderIdRef = computed(() => props.orderId);
const edit = useOrderLineEdit(orderIdRef, () => emit('adjusted'));
const anyShort = computed(() =>
    [...edit.availability.value.values()].some(a => a.fitting < a.needed),
);

onMounted(edit.load);
watch(() => props.lines, edit.load);

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
    <OrderLinesEditBar
        v-if="canEditLines"
        :any-short="anyShort"
        :busy="edit.busy.value"
        :error="edit.error.value"
        :split="edit.lastSplit.value"
        :already-within-stock="edit.alreadyWithinStock.value"
        @cut="edit.cutToStock"
    />
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
                    <th v-if="canEditLines" rowspan="2" class="order-lines__edit">Quantity</th>
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
                            <em
                                v-for="f in listedFindings(findingsByLineId.get(line.id) ?? [])"
                                :key="f.id"
                                class="order-lines__finding"
                            >
                                {{ findingTitle(f.messageKey) }}
                                <template v-if="findingDetail(f)"
                                    >({{ findingDetail(f) }})</template
                                >
                            </em>
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
                                    edit.availability.value.get(line.id)?.available,
                                    findingsByLineId.get(line.id) ?? [],
                                )
                            "
                            :reserved="lineReservedQuantity(reservations, line.id)"
                            :sources="edit.availability.value.get(line.id) ?? null"
                        />
                        <td class="order-lines__num">
                            <OrderLineUnitPrice
                                :price="money(line.discountedUnitPriceWithTax)"
                                :below-floor="isBelowFloor(findingsByLineId.get(line.id) ?? [])"
                            />
                        </td>
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
                        <td class="order-lines__num">
                            {{ money(line.discountedLinePriceWithTax) }}
                        </td>
                        <td v-if="canEditLines" class="order-lines__edit">
                            <OrderLineEditCell
                                :quantity="line.quantity"
                                :step="edit.availability.value.get(line.id)?.step ?? 1"
                                :can-remove="lines.length > 1"
                                :busy="edit.busy.value"
                                @save="edit.setQuantity(line.id, $event)"
                                @remove="edit.remove(line.id)"
                            />
                        </td>
                    </tr>
                    <tr v-if="openAdjustLineId === line.id">
                        <td :colspan="canEditLines ? 10 : 9">
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

.order-lines__edit {
    width: 1%;
    white-space: nowrap;
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

.order-lines__finding {
    display: block;
    margin-top: 2px;
    color: var(--el-color-warning, #d97706);
    font-size: 12px;
    font-style: normal;
    font-weight: 700;
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
