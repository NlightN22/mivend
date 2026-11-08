<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { IconTrash } from '@tabler/icons-vue';
import {
    MvButton,
    MvDocumentLines,
    MvNotice,
    useLineSelection,
    type DocColumn,
} from '@mivend/ui-kit';
import { removeOrderLine } from '../../api/orderLineEdit';
import type { OrderDetailLine, PriceAdjustmentRequestSummary } from '../../api/orderDetail';
import type { OrderReservation } from '../../api/reservation';
import { formatLineQuantity } from '../../composables/lineSalesUnit';
import { stepperMin } from '../../composables/orderLineStepper';
import { quantityUnitHint } from '../../utils/quantityUnit';
import { referencePrice } from '../../utils/lineValueModel';
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
import OrderAddRow from './OrderAddRow.vue';
import OrderLineDiscount from './OrderLineDiscount.vue';
import OrderLineDiscountEdit from './OrderLineDiscountEdit.vue';
import OrderLinePrice from './OrderLinePrice.vue';
import OrderLinePriceEdit from './OrderLinePriceEdit.vue';
import OrderLineProduct from './OrderLineProduct.vue';
import OrderLineReserve from './OrderLineReserve.vue';
import OrderLineRetroBonus from './OrderLineRetroBonus.vue';
import OrderLineQtyCell from './OrderLineQtyCell.vue';
import OrderLineStockInfo from './OrderLineStockInfo.vue';
import OrderLinesDeleteDialog from './OrderLinesDeleteDialog.vue';
import OrderLinesEditBar from './OrderLinesEditBar.vue';

const MAX_LINE_QUANTITY = 1_000_000;

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
    reference: line =>
        referencePrice(
            line.discountedUnitPriceWithTax,
            edit.lineDiscounts.value.get(line.id)?.percent ?? null,
            line.unitPriceWithTax,
        ),
    limit: id => edit.lineDiscounts.value.get(id)?.max ?? null,
});
const draft = editing.edit.draft;
const draftTotal = computed(() =>
    Math.round(draft.value.quantity * Number(draft.value.unitPrice || 0) * 100),
);
const symbol = computed(
    () =>
        new Intl.NumberFormat('ru-RU', { style: 'currency', currency: props.currencyCode })
            .formatToParts(0)
            .find(p => p.type === 'currency')?.value ?? props.currencyCode,
);

const columns = computed<DocColumn[]>(() => [
    { key: 'product', label: 'Product' },
    { key: 'qty', label: 'Qty', inputWhenEditing: true },
    { key: 'available', label: 'Available' },
    { key: 'reserve', label: 'Reserve' },
    { key: 'price', label: 'Price', inputWhenEditing: true },
    { key: 'discount', label: 'Discount', inputWhenEditing: true },
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

const money = (amount: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: props.currencyCode }).format(
        amount / 100,
    );

const unitHint = (line: OrderDetailLine, step: number): string =>
    quantityUnitHint(line.productVariant.customFields?.unitName, step);

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
        :adding="adder.open.value"
        :add-label="canEditLines ? 'Add position' : undefined"
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
        @add="adder.begin"
        @flag-action="flagAction"
    >
        <template #add-row>
            <OrderAddRow :add="adder" :busy="edit.busy.value" :currency-symbol="symbol" />
        </template>
        <template #bulk="{ count }">
            <MvButton
                variant="danger"
                size="sm"
                :disabled="edit.busy.value || count >= lines.length || !count"
                @click="pendingDelete = [...selection.selected.value]"
            >
                <IconTrash :size="14" /> Delete
            </MvButton>
        </template>
        <template #notices>
            <OrderLinesEditBar
                v-if="canEditLines"
                :error="edit.error.value"
                :split="edit.lastSplit.value"
                :already-within-stock="edit.alreadyWithinStock.value"
            />
            <MvNotice v-if="adder.notice.value" variant="warning">{{
                adder.notice.value
            }}</MvNotice>
        </template>
        <template #cell-product="{ row }">
            <OrderLineProduct
                :name="row.row.line.productVariant.name"
                :sku="row.row.line.productVariant.sku"
                :image="row.row.line.featuredAsset?.preview ?? null"
            />
        </template>
        <template #cell-qty="{ row, editing: isEditing }">
            <OrderLineQtyCell
                :quantity="isEditing ? draft.quantity : row.row.line.quantity"
                :text="
                    formatLineQuantity(
                        row.row.line.quantity,
                        row.row.line.productVariant.customFields,
                        packagesOnly,
                    )
                "
                :editing="isEditing && caps.canEditQuantity"
                :min="stepperMin(caps.canRemove, stepOf(row.id))"
                :step="stepOf(row.id)"
                :max="MAX_LINE_QUANTITY"
                :disabled="!!editing.savingId.value"
                :unit="packagesOnly && !isEditing ? '' : unitHint(row.row.line, stepOf(row.id))"
                @update:quantity="draft.quantity = $event"
            />
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
            <OrderLinePriceEdit
                v-if="isEditing && caps.canEditPrice"
                :price="draft.unitPrice"
                :justification="draft.justification"
                :symbol="symbol"
                :needs-reason="editing.hint.value.kind === 'approval'"
                :disabled="!!editing.savingId.value"
                @update:price="editing.setPrice"
                @update:justification="draft.justification = $event"
            />
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
        <template #cell-discount="{ row, editing: isEditing }">
            <OrderLineDiscountEdit
                v-if="isEditing && caps.canEditPrice"
                :percent="editing.discountText.value"
                :hint="editing.hint.value"
                :disabled="!!editing.savingId.value"
                @update:percent="editing.setPercent"
            />
            <OrderLineDiscount v-else :percent="row.row.discountPercent" />
        </template>
        <template #cell-retro="{ row }">
            <OrderLineRetroBonus :bonus="retro?.get(row.id) ?? null" :money="money" />
        </template>
        <template #cell-total="{ row, editing: isEditing }">
            <strong v-if="isEditing">{{ money(draftTotal) }}</strong>
            <strong v-else>{{ money(row.row.line.discountedLinePriceWithTax) }}</strong>
        </template>
        <template #totals><slot name="totals" /></template>
    </MvDocumentLines>
    <OrderLinesDeleteDialog
        v-if="pendingDelete.length"
        :count="pendingDelete.length"
        :busy="edit.busy.value"
        @close="pendingDelete = []"
        @confirm="confirmDelete"
    />
</template>

<style scoped>
.lines__hint {
    display: block;
    margin-top: 4px;
    color: var(--app-text-grey);
    font-size: 12px;
}
</style>
