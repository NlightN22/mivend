<script setup lang="ts">
import { computed } from 'vue';
import { MvCheckbox, MvInput, MvQtyStepper } from '@mivend/ui-kit';
import type { OrderLineAvailability } from '../../api/orderLineEdit';
import { formatLineQuantity } from '../../composables/lineSalesUnit';
import { stepperMin } from '../../composables/orderLineStepper';
import { useLineRowEdit } from '../../composables/useLineRowEdit';
import type { FindingConsequence } from '../../utils/findingConsequence';
import type { LineProblems } from '../../utils/orderLineProblems';
import type { OrderLineRow } from '../../utils/orderLineRows';
import OrderCell from './OrderCell.vue';
import OrderLineActions from './OrderLineActions.vue';
import OrderLineDiscount from './OrderLineDiscount.vue';
import OrderLinePrice from './OrderLinePrice.vue';
import OrderLineProduct from './OrderLineProduct.vue';
import OrderLineReserve from './OrderLineReserve.vue';
import OrderLineStockInfo from './OrderLineStockInfo.vue';

const props = defineProps<{
    row: OrderLineRow;
    problems: LineProblems;
    consequences: Map<string, FindingConsequence>;
    orderId: string;
    packagesOnly: boolean;
    canEditPrice: boolean;
    canEditQuantity: boolean;
    canRemove: boolean;
    canConfirm: boolean;
    canReject: boolean;
    selectable: boolean;
    selected: boolean;
    sources: OrderLineAvailability | null;
    busy: boolean;
    money: (amount: number) => string;
    apply: (action: () => Promise<void>) => Promise<boolean>;
}>();
defineEmits<{ toggle: []; remove: []; confirm: []; reject: [] }>();

const line = computed(() => props.row.line);
const cellProps = computed(() => ({
    consequences: props.consequences,
    canConfirm: props.canConfirm,
    canReject: props.canReject,
}));
const step = computed(() => props.sources?.step ?? 1);
const edit = useLineRowEdit({
    orderId: () => props.orderId,
    lineId: () => line.value.id,
    original: () => ({
        quantity: line.value.quantity,
        unitPriceMinor: line.value.discountedUnitPriceWithTax,
    }),
    caps: () => ({
        canEditQuantity: props.canEditQuantity,
        canEditPrice: props.canEditPrice,
        canRemove: props.canRemove,
    }),
    apply: props.apply,
});
const canEdit = computed(() => props.canEditPrice || props.canEditQuantity);
const priceChanged = computed(
    () =>
        Math.round(Number(edit.draft.value.unitPrice) * 100) !==
        line.value.discountedUnitPriceWithTax,
);
</script>

<template>
    <tr
        class="line-row"
        :class="[`line-row--${problems.stripe}`, { 'line-row--editing': edit.editing.value }]"
        :data-testid="`order-line-${line.productVariant.sku}`"
    >
        <td v-if="selectable" class="line-row__select">
            <MvCheckbox
                :model-value="selected"
                :label="`Select ${line.productVariant.sku}`"
                @update:model-value="$emit('toggle')"
            />
        </td>
        <td class="line-row__product" data-label="Product">
            <OrderLineProduct
                :name="line.productVariant.name"
                :sku="line.productVariant.sku"
                :image="line.featuredAsset?.preview ?? null"
            />
        </td>
        <td class="line-row__num" data-label="Qty">
            <template v-if="edit.editing.value && canEditQuantity">
                <MvQtyStepper
                    v-model="edit.draft.value.quantity"
                    size="sm"
                    :min="stepperMin(canRemove, step)"
                    :step="step"
                    :disabled="edit.state.value === 'saving'"
                />
                <span v-if="edit.draft.value.quantity === 0" class="line-row__hint">
                    Line will be removed
                </span>
            </template>
            <OrderCell
                v-else
                v-bind="cellProps"
                :problem="problems.cells.qty"
                @confirm="$emit('confirm')"
                @reject="$emit('reject')"
            >
                {{
                    formatLineQuantity(
                        line.quantity,
                        line.productVariant.customFields,
                        packagesOnly,
                    )
                }}
            </OrderCell>
        </td>
        <td class="line-row__num" data-label="Available">
            <OrderCell
                v-bind="cellProps"
                :problem="problems.cells.available"
                @confirm="$emit('confirm')"
                @reject="$emit('reject')"
            >
                <OrderLineStockInfo :view="row.view" :sources="sources" />
            </OrderCell>
        </td>
        <td class="line-row__num" data-label="Reserve">
            <OrderCell
                v-bind="cellProps"
                :problem="problems.cells.reserve"
                @confirm="$emit('confirm')"
                @reject="$emit('reject')"
            >
                <OrderLineReserve :reserved="row.reserved" :needed="row.view.needed" />
            </OrderCell>
        </td>
        <td class="line-row__num" data-label="Price">
            <div v-if="edit.editing.value && canEditPrice" class="line-row__price-edit">
                <MvInput
                    v-model="edit.draft.value.unitPrice"
                    size="sm"
                    type="number"
                    :disabled="edit.state.value === 'saving'"
                />
                <MvInput
                    v-if="priceChanged"
                    v-model="edit.draft.value.justification"
                    size="sm"
                    placeholder="Justification (needed for approval)"
                    :disabled="edit.state.value === 'saving'"
                />
            </div>
            <OrderCell
                v-else
                v-bind="cellProps"
                :problem="problems.cells.price"
                @confirm="$emit('confirm')"
                @reject="$emit('reject')"
            >
                <OrderLinePrice
                    :price="money(line.discountedUnitPriceWithTax)"
                    :adjustment="row.adjustment"
                />
            </OrderCell>
            <span v-if="edit.sentForApproval.value && !edit.editing.value" class="line-row__hint">
                Sent for approval
            </span>
        </td>
        <td class="line-row__num" data-label="Discount">
            <OrderCell
                v-bind="cellProps"
                :problem="problems.cells.discount"
                @confirm="$emit('confirm')"
                @reject="$emit('reject')"
            >
                <OrderLineDiscount :percent="row.discountPercent" />
            </OrderCell>
        </td>
        <td class="line-row__num line-row__total" data-label="Total">
            {{ money(line.discountedLinePriceWithTax) }}
        </td>
        <td class="line-row__actions">
            <OrderLineActions
                :editing="edit.editing.value"
                :saving="edit.state.value === 'saving'"
                :busy="busy"
                :can-edit="canEdit"
                :can-remove="canRemove && canEditQuantity"
                @start="edit.start"
                @commit="edit.commit"
                @cancel="edit.cancel"
                @remove="$emit('remove')"
            />
        </td>
    </tr>
    <tr v-if="edit.error.value" class="line-row__error-row">
        <td :colspan="selectable ? 9 : 8" class="line-row__error">{{ edit.error.value }}</td>
    </tr>
</template>

<style scoped src="./OrderLineRow.css"></style>
