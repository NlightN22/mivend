<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
    MvButton,
    MvDocumentLines,
    MvInput,
    MvModal,
    MvQtyStepper,
    useLineSelection,
    type DocColumn,
} from '@mivend/ui-kit';
import { removeOrderLine } from '../../api/orderLineEdit';
import type { OrderDetailLine, PriceAdjustmentRequestSummary } from '../../api/orderDetail';
import type { OrderReservation } from '../../api/reservation';
import { formatLineQuantity } from '../../composables/lineSalesUnit';
import { stepperMin } from '../../composables/orderLineStepper';
import { useOrderLineAdd } from '../../composables/useOrderLineAdd';
import { useOrderLineEditing } from '../../composables/useOrderLineEditing';
import type { LineBonus } from '../../composables/useOrderRetroBonus';
import type { useOrderLineEdit } from '../../composables/useOrderLineEdit';
import type { FindingConsequence } from '../../utils/findingConsequence';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { toDocRow, type OrderDocRow } from '../../utils/orderDocFlags';
import { lineProblems } from '../../utils/orderLineProblems';
import { buildLineRows } from '../../utils/orderLineRows';
import { lineNotes, type PanelNotes } from '../../utils/orderPanelNotes';
import OrderAddLine from './OrderAddLine.vue';
import OrderLineDiscount from './OrderLineDiscount.vue';
import OrderLinePrice from './OrderLinePrice.vue';
import OrderLineProduct from './OrderLineProduct.vue';
import OrderLineReserve from './OrderLineReserve.vue';
import OrderLineRetroBonus from './OrderLineRetroBonus.vue';
import OrderLineStockInfo from './OrderLineStockInfo.vue';
import OrderLinesEditBar from './OrderLinesEditBar.vue';

const props = defineProps<{
    orderId: string;
    edit: ReturnType<typeof useOrderLineEdit>;
    retro: Map<string, LineBonus> | null;
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
const selection = useLineSelection(computed(() => props.lines.map(l => l.id)));
const pendingDelete = ref<string[]>([]);
const caps = computed(() => ({
    canEditQuantity: props.canEditLines,
    canEditPrice: props.editable,
    // An order keeps at least one line, so the last one is never offered for deletion.
    canRemove: props.canEditLines && props.lines.length > 1,
}));
const editing = useOrderLineEditing({
    orderId: () => props.orderId,
    lines: () => props.lines,
    caps: () => caps.value,
    apply: edit.apply,
});
const draft = editing.edit.draft;
const priceChanged = computed(
    () =>
        Math.round(Number(draft.value.unitPrice) * 100) !==
        props.lines.find(l => l.id === editing.editingId.value)?.discountedUnitPriceWithTax,
);

const columns = computed<DocColumn[]>(() => [
    { key: 'product', label: 'Product' },
    { key: 'qty', label: 'Qty' },
    { key: 'available', label: 'Available' },
    { key: 'reserve', label: 'Reserve' },
    { key: 'price', label: 'Price' },
    { key: 'discount', label: 'Discount' },
    { key: 'retro', label: 'Retro bonus', hidden: !props.retro },
    { key: 'total', label: 'Total' },
]);
const rows = computed<OrderDocRow[]>(() =>
    buildLineRows({
        lines: props.lines,
        findings: props.findings,
        availability: edit.availability.value,
        reservations: props.reservations,
        requests: props.adjustmentRequests,
        lineDiscount: line => edit.lineDiscounts.value.get(line.id) ?? null,
    }).map(row =>
        toDocRow(
            row,
            lineProblems(
                row,
                props.consequences,
                lineNotes(props.panelNotes, row.line.productVariant.sku),
            ),
            props,
        ),
    ),
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

function stepOf(id: string): number {
    return edit.availability.value.get(id)?.step ?? 1;
}

function flagAction(_id: string, _column: string, action: string): void {
    if (action === 'confirm') emit('confirm');
    else emit('reject');
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
    <MvDocumentLines
        title="Order lines"
        :columns="columns"
        :rows="rows"
        :selection="caps.canRemove ? selection : undefined"
        :editing-id="editing.editingId.value"
        :saving-id="editing.savingId.value"
        :errors="editing.errors.value"
        :busy="edit.busy.value"
        :can-edit="() => caps.canEditQuantity || caps.canEditPrice"
        :can-remove="() => caps.canRemove && caps.canEditQuantity"
        @start="editing.start"
        @commit="editing.commit"
        @cancel="editing.cancel"
        @remove="pendingDelete = [$event]"
        @flag-action="flagAction"
    >
        <template #toolbar>
            <OrderAddLine
                v-if="canEditLines"
                :matches="adder.matches.value"
                :busy="edit.busy.value"
                @search="adder.search"
                @add="adder.add"
            />
        </template>
        <template #bulk="{ count }">
            <MvButton
                variant="danger"
                size="sm"
                :disabled="edit.busy.value || count >= lines.length || !count"
                @click="pendingDelete = [...selection.selected.value]"
            >
                Delete {{ count }}
            </MvButton>
        </template>
        <template #notices>
            <OrderLinesEditBar
                v-if="canEditLines"
                :error="edit.error.value"
                :split="edit.lastSplit.value"
                :already-within-stock="edit.alreadyWithinStock.value"
            />
        </template>
        <template #cell-product="{ row }">
            <OrderLineProduct
                :name="row.row.line.productVariant.name"
                :sku="row.row.line.productVariant.sku"
                :image="row.row.line.featuredAsset?.preview ?? null"
            />
        </template>
        <template #cell-qty="{ row, editing: isEditing }">
            <template v-if="isEditing && caps.canEditQuantity">
                <MvQtyStepper
                    v-model="draft.quantity"
                    size="sm"
                    :min="stepperMin(caps.canRemove, stepOf(row.id))"
                    :step="stepOf(row.id)"
                    :disabled="!!editing.savingId.value"
                />
                <span v-if="draft.quantity === 0" class="lines__hint">Line will be removed</span>
            </template>
            <template v-else>
                {{
                    formatLineQuantity(
                        row.row.line.quantity,
                        row.row.line.productVariant.customFields,
                        packagesOnly,
                    )
                }}
            </template>
        </template>
        <template #cell-available="{ row }">
            <OrderLineStockInfo
                :view="row.row.view"
                :sources="edit.availability.value.get(row.id) ?? null"
            />
        </template>
        <template #cell-reserve="{ row }">
            <OrderLineReserve :reserved="row.row.reserved" :needed="row.row.view.needed" />
        </template>
        <template #cell-price="{ row, editing: isEditing }">
            <div v-if="isEditing && caps.canEditPrice" class="lines__price-edit">
                <MvInput
                    v-model="draft.unitPrice"
                    size="sm"
                    type="number"
                    :disabled="!!editing.savingId.value"
                />
                <MvInput
                    v-if="priceChanged"
                    v-model="draft.justification"
                    size="sm"
                    placeholder="Justification (needed for approval)"
                    :disabled="!!editing.savingId.value"
                />
            </div>
            <template v-else>
                <OrderLinePrice
                    :price="money(row.row.line.discountedUnitPriceWithTax)"
                    :adjustment="row.row.adjustment"
                />
                <span
                    v-if="editing.edit.sentForApproval.value && editing.lastId.value === row.id"
                    class="lines__hint"
                >
                    Sent for approval
                </span>
            </template>
        </template>
        <template #cell-discount="{ row }">
            <OrderLineDiscount :percent="row.row.discountPercent" />
        </template>
        <template #cell-retro="{ row }">
            <OrderLineRetroBonus :bonus="retro?.get(row.id) ?? null" :money="money" />
        </template>
        <template #cell-total="{ row }">
            <strong>{{ money(row.row.line.discountedLinePriceWithTax) }}</strong>
        </template>
        <template #totals><slot name="totals" /></template>
    </MvDocumentLines>
    <MvModal v-if="pendingDelete.length" title="Delete positions?" @close="pendingDelete = []">
        <p>
            {{ pendingDelete.length }}
            {{ pendingDelete.length === 1 ? 'position' : 'positions' }} will be removed from the
            order.
        </p>
        <div class="lines__confirm">
            <MvButton variant="secondary" @click="pendingDelete = []">Keep</MvButton>
            <MvButton variant="danger" :loading="edit.busy.value" @click="confirmDelete">
                Delete {{ pendingDelete.length }}
                {{ pendingDelete.length === 1 ? 'position' : 'positions' }}
            </MvButton>
        </div>
    </MvModal>
</template>

<style scoped>
.lines__price-edit {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 120px;
}

.lines__hint {
    display: block;
    margin-top: 4px;
    color: var(--app-text-grey);
    font-size: 12px;
}

.lines__confirm {
    display: flex;
    gap: 12px;
    margin-top: 12px;
}
</style>
