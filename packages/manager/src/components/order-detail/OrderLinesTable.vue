<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvCheckbox, MvModal, MvButton } from '@mivend/ui-kit';
import { removeOrderLine } from '../../api/orderLineEdit';
import type { OrderDetailLine, PriceAdjustmentRequestSummary } from '../../api/orderDetail';
import type { OrderReservation } from '../../api/reservation';
import { useOrderLineAdd } from '../../composables/useOrderLineAdd';
import type { useOrderLineEdit } from '../../composables/useOrderLineEdit';
import { useRowSelection } from '../../composables/useRowSelection';
import type { FindingConsequence } from '../../utils/findingConsequence';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { lineProblems } from '../../utils/orderLineProblems';
import { buildLineRows } from '../../utils/orderLineRows';
import { lineNotes, type PanelNotes } from '../../utils/orderPanelNotes';
import OrderAddLine from './OrderAddLine.vue';
import OrderLineRow from './OrderLineRow.vue';
import OrderLinesBulkBar from './OrderLinesBulkBar.vue';
import OrderLinesEditBar from './OrderLinesEditBar.vue';

const props = defineProps<{
    orderId: string;
    edit: ReturnType<typeof useOrderLineEdit>;
    panelNotes: PanelNotes;
    lines: OrderDetailLine[];
    currencyCode: string;
    editable: boolean;
    canEditLines: boolean;
    packagesOnly: boolean;
    adjustmentRequests: PriceAdjustmentRequestSummary[];
    findings: OrderCheckFinding[];
    consequences: Map<string, FindingConsequence>;
    reservations: OrderReservation[];
    canConfirm: boolean;
    canReject: boolean;
}>();
const emit = defineEmits<{ confirm: []; reject: [] }>();

const edit = props.edit;
const adder = useOrderLineAdd(() => props.orderId, edit.apply);
const selection = useRowSelection(computed(() => props.lines.map(l => l.id)));
const pendingDelete = ref<string[]>([]);
const rows = computed(() =>
    buildLineRows({
        lines: props.lines,
        findings: props.findings,
        availability: edit.availability.value,
        reservations: props.reservations,
        requests: props.adjustmentRequests,
        lineDiscount: line => edit.lineDiscounts.value.get(line.id) ?? null,
    }),
);
// An order keeps at least one line, so the last one is never offered for deletion.
const removable = computed(() => props.canEditLines && props.lines.length > 1);

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

async function confirmDelete(): Promise<void> {
    const ids = pendingDelete.value;
    const ok = await edit.apply(async () => {
        for (const id of ids) await removeOrderLine(props.orderId, id);
    });
    pendingDelete.value = [];
    if (ok) selection.clear();
}
</script>

<template>
    <div class="order-lines__toolbar">
        <OrderAddLine
            v-if="canEditLines"
            :matches="adder.matches.value"
            :busy="edit.busy.value"
            @search="adder.search"
            @add="adder.add"
        />
        <MvButton
            v-if="removable"
            variant="secondary"
            size="sm"
            @click="selection.active.value ? selection.clear() : (selection.active.value = true)"
        >
            {{ selection.active.value ? 'Done selecting' : 'Select positions' }}
        </MvButton>
    </div>
    <OrderLinesEditBar
        v-if="canEditLines"
        :error="edit.error.value"
        :split="edit.lastSplit.value"
        :already-within-stock="edit.alreadyWithinStock.value"
    />
    <OrderLinesBulkBar
        v-if="selection.active.value && selection.count.value"
        :count="selection.count.value"
        :busy="edit.busy.value || selection.count.value >= lines.length"
        @remove="pendingDelete = [...selection.selected.value]"
        @clear="selection.clear"
    />
    <div class="order-lines__scroll">
        <table class="order-lines">
            <thead>
                <tr>
                    <th v-if="selection.active.value" class="order-lines__select">
                        <MvCheckbox
                            :model-value="selection.allSelected.value"
                            :indeterminate="
                                selection.count.value > 0 && !selection.allSelected.value
                            "
                            label="Select all positions"
                            @update:model-value="selection.setAll"
                        />
                    </th>
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
                    :problems="
                        lineProblems(
                            row,
                            consequences,
                            lineNotes(panelNotes, row.line.productVariant.sku),
                        )
                    "
                    :consequences="consequences"
                    :order-id="orderId"
                    :packages-only="packagesOnly"
                    :can-edit-price="editable"
                    :can-edit-quantity="canEditLines"
                    :can-remove="removable"
                    :can-confirm="canConfirm"
                    :can-reject="canReject"
                    :selectable="selection.active.value"
                    :selected="selection.selected.value.has(row.line.id)"
                    :sources="edit.availability.value.get(row.line.id) ?? null"
                    :busy="edit.busy.value"
                    :money="money"
                    :apply="edit.apply"
                    @toggle="selection.toggle(row.line.id)"
                    @remove="pendingDelete = [row.line.id]"
                    @confirm="emit('confirm')"
                    @reject="emit('reject')"
                />
            </tbody>
        </table>
    </div>
    <MvModal v-if="pendingDelete.length" title="Delete positions?" @close="pendingDelete = []">
        <p>
            {{ pendingDelete.length }}
            {{ pendingDelete.length === 1 ? 'position' : 'positions' }} will be removed from the
            order.
        </p>
        <div class="order-lines__confirm">
            <MvButton variant="secondary" @click="pendingDelete = []">Keep</MvButton>
            <MvButton variant="danger" :loading="edit.busy.value" @click="confirmDelete">
                Delete {{ pendingDelete.length }}
                {{ pendingDelete.length === 1 ? 'position' : 'positions' }}
            </MvButton>
        </div>
    </MvModal>
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

.order-lines__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
}

.order-lines__confirm {
    display: flex;
    gap: 12px;
    margin-top: 12px;
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
