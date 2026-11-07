<script setup lang="ts">
import { computed } from 'vue';
import { MvInput, MvQtyStepper } from '@mivend/ui-kit';
import type { OrderLineAvailability } from '../../api/orderLineEdit';
import { formatLineQuantity } from '../../composables/lineSalesUnit';
import { stepperMin } from '../../composables/orderLineStepper';
import { useLineRowEdit } from '../../composables/useLineRowEdit';
import type { OrderLineRow } from '../../utils/orderLineRows';
import OrderLineActions from './OrderLineActions.vue';
import OrderLineDiscount from './OrderLineDiscount.vue';
import OrderLinePrice from './OrderLinePrice.vue';
import OrderLineProduct from './OrderLineProduct.vue';
import OrderLineReserve from './OrderLineReserve.vue';
import OrderLineStockInfo from './OrderLineStockInfo.vue';

const props = defineProps<{
    row: OrderLineRow;
    orderId: string;
    packagesOnly: boolean;
    canEditPrice: boolean;
    canEditQuantity: boolean;
    canRemove: boolean;
    sources: OrderLineAvailability | null;
    busy: boolean;
    money: (amount: number) => string;
    apply: (action: () => Promise<void>) => Promise<boolean>;
}>();

const line = computed(() => props.row.line);
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
        :class="[`line-row--${row.severity}`, { 'line-row--editing': edit.editing.value }]"
    >
        <td class="line-row__product" data-label="Product">
            <OrderLineProduct
                :name="line.productVariant.name"
                :sku="line.productVariant.sku"
                :findings="row.findings"
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
            <template v-else>
                {{
                    formatLineQuantity(
                        line.quantity,
                        line.productVariant.customFields,
                        packagesOnly,
                    )
                }}
            </template>
        </td>
        <td class="line-row__num" data-label="Available">
            <OrderLineStockInfo :view="row.view" :sources="sources" />
        </td>
        <td class="line-row__num" data-label="Reserve">
            <OrderLineReserve
                :reserved="row.reserved"
                :needed="row.view.needed"
                :short="row.reserveShort"
            />
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
            <OrderLinePrice
                v-else
                :price="money(line.discountedUnitPriceWithTax)"
                :below-floor="row.belowFloor"
                :adjustment="row.adjustment"
            />
            <span v-if="edit.sentForApproval.value && !edit.editing.value" class="line-row__hint">
                Sent for approval
            </span>
        </td>
        <td class="line-row__num" data-label="Discount">
            <OrderLineDiscount
                :percent="row.discountPercent"
                :max-percent="row.maxDiscountPercent"
                :over-limit="row.discountOverLimit"
            />
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
                @start="edit.start"
                @commit="edit.commit"
                @cancel="edit.cancel"
            />
        </td>
    </tr>
    <tr v-if="edit.error.value" class="line-row__error-row">
        <td colspan="8" class="line-row__error">{{ edit.error.value }}</td>
    </tr>
</template>

<style scoped>
.line-row td {
    padding: 10px;
    border-bottom: 1px solid var(--app-row-border);
    vertical-align: middle;
}

.line-row__product {
    min-width: 180px;
    box-shadow: inset 3px 0 0 transparent;
}

.line-row--danger .line-row__product {
    box-shadow: inset 3px 0 0 var(--app-danger-btn);
}

.line-row--warning .line-row__product {
    box-shadow: inset 3px 0 0 var(--app-accent-orange);
}

.line-row--editing {
    background: var(--app-stock-in-bg);
}

.line-row--editing .line-row__product {
    box-shadow: inset 3px 0 0 var(--app-brand-fill);
}

.line-row__num {
    text-align: right;
    white-space: nowrap;
}

.line-row__total {
    font-weight: 700;
}

.line-row__price-edit {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 120px;
}

.line-row__hint {
    display: block;
    margin-top: 4px;
    color: var(--app-text-grey);
    font-size: 12px;
}

.line-row__actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
}

.line-row__error {
    padding: 6px 10px;
    color: var(--app-danger-fg);
    font-size: 13px;
}

@media (max-width: 800px) {
    .line-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 12px;
        padding: 12px;
        margin-bottom: 10px;
        border: 1px solid var(--el-border-color);
        border-left: 4px solid transparent;
        border-radius: var(--app-radius-md, 12px);
        background: var(--app-surface);
    }

    .line-row--danger {
        border-left-color: var(--app-danger-btn);
    }

    .line-row--warning {
        border-left-color: var(--app-accent-orange);
    }

    .line-row--editing {
        background: var(--app-stock-in-bg);
        border-left-color: var(--app-brand-fill);
    }

    .line-row td,
    .line-row__product {
        padding: 0;
        border: 0;
        box-shadow: none;
        text-align: left;
        white-space: normal;
    }

    .line-row__product,
    .line-row__actions {
        grid-column: 1 / -1;
    }

    .line-row__actions {
        width: auto;
        text-align: right;
    }

    .line-row td[data-label]::before {
        content: attr(data-label);
        display: block;
        color: var(--app-text-grey);
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .line-row__num :deep(.line-price) {
        align-items: flex-start;
    }
}
</style>
