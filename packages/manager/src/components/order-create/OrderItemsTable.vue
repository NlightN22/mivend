<script setup lang="ts">
import { ref } from 'vue';
import type { DraftOrderLine } from '../../api/orderCreate';
import PriceAdjustmentPanel from './PriceAdjustmentPanel.vue';

const props = defineProps<{
    orderId: string;
    lines: DraftOrderLine[];
    currencyCode: string;
    pendingApprovalLineIds: Set<string>;
}>();
const emit = defineEmits<{
    'update-quantity': [lineId: string, quantity: number];
    remove: [lineId: string];
    adjusted: [lineId: string, decision: 'apply-directly' | 'requires-approval'];
}>();

const openAdjustLineId = ref<string | null>(null);

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: props.currencyCode }).format(
        amount / 100,
    );
}

function toggleAdjust(lineId: string): void {
    openAdjustLineId.value = openAdjustLineId.value === lineId ? null : lineId;
}
</script>

<template>
    <table v-if="lines.length" class="order-items">
        <thead>
            <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th></th>
                <th>Line total</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            <template v-for="line in lines" :key="line.id">
                <tr>
                    <td>{{ line.productVariant.sku }}</td>
                    <td>{{ line.productVariant.name }}</td>
                    <td>
                        <input
                            type="number"
                            min="1"
                            class="order-items__qty"
                            :value="line.quantity"
                            @change="
                                emit(
                                    'update-quantity',
                                    line.id,
                                    Number(($event.target as HTMLInputElement).value),
                                )
                            "
                        />
                    </td>
                    <td>{{ money(line.unitPriceWithTax) }}</td>
                    <td>
                        <button type="button" class="order-items__adjust" @click="toggleAdjust(line.id)">
                            {{ pendingApprovalLineIds.has(line.id) ? '⚠ Pending approval' : 'Adjust price' }}
                        </button>
                    </td>
                    <td>{{ money(line.linePriceWithTax) }}</td>
                    <td>
                        <button type="button" class="order-items__remove" @click="emit('remove', line.id)">
                            Remove
                        </button>
                    </td>
                </tr>
                <tr v-if="openAdjustLineId === line.id">
                    <td colspan="7">
                        <PriceAdjustmentPanel
                            :order-id="orderId"
                            :line="line"
                            @applied="
                                decision => {
                                    emit('adjusted', line.id, decision);
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
.order-items {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.order-items th {
    text-align: left;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    padding: 8px 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.order-items td {
    padding: 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.order-items__qty {
    width: 56px;
    height: 32px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 8px;
    padding: 0 8px;
}

.order-items__adjust,
.order-items__remove {
    background: none;
    border: none;
    color: var(--el-color-primary-dark-2, #008a70);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}

.order-items__remove {
    color: #dc2626;
}
</style>
