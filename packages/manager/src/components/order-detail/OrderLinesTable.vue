<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import type { OrderDetailLine, PriceAdjustmentRequestSummary } from '../../api/orderDetail';
import { useOrderLineEdit } from '../../composables/useOrderLineEdit';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { buildLineRows } from '../../utils/orderLineRows';
import type { OrderReservation } from '../../api/reservation';
import OrderLineRow from './OrderLineRow.vue';
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

const orderIdRef = computed(() => props.orderId);
const edit = useOrderLineEdit(orderIdRef, () => emit('adjusted'));
const anyShort = computed(() =>
    [...edit.availability.value.values()].some(a => a.fitting < a.needed),
);
const rows = computed(() =>
    buildLineRows({
        lines: props.lines,
        findings: props.findings,
        availability: edit.availability.value,
        reservations: props.reservations,
        requests: props.adjustmentRequests,
        maxDiscountPercent: line => edit.discountCeilings.value.get(line.id) ?? null,
    }),
);

onMounted(() => void Promise.all([edit.load(), edit.loadCeilings()]));
watch(
    () => props.lines,
    () => void Promise.all([edit.load(), edit.loadCeilings()]),
);

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: props.currencyCode,
    }).format(amount / 100);
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
                    <th>Product</th>
                    <th class="order-lines__num">Qty</th>
                    <th class="order-lines__num">Available</th>
                    <th class="order-lines__num">Reserve</th>
                    <th class="order-lines__num">Price</th>
                    <th class="order-lines__num">Discount</th>
                    <th class="order-lines__num">Total</th>
                    <th class="order-lines__actions" />
                </tr>
            </thead>
            <tbody>
                <OrderLineRow
                    v-for="row in rows"
                    :key="row.line.id"
                    :row="row"
                    :order-id="orderId"
                    :packages-only="packagesOnly"
                    :can-edit-price="editable"
                    :can-edit-quantity="canEditLines"
                    :can-remove="lines.length > 1"
                    :sources="edit.availability.value.get(row.line.id) ?? null"
                    :busy="edit.busy.value"
                    :money="money"
                    :apply="edit.apply"
                />
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
    color: var(--app-text-grey);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    padding: 8px 10px;
    background: var(--app-row-head);
    border-bottom: 1px solid var(--el-border-color);
}

.order-lines__num {
    text-align: right;
}

.order-lines__scroll {
    overflow-x: auto;
}

@media (max-width: 800px) {
    .order-lines thead {
        display: none;
    }

    .order-lines,
    .order-lines :deep(tbody) {
        display: block;
    }
}
</style>
