<script setup lang="ts">
import { computed } from 'vue';
import { MvDocumentLines, MvDocumentTotals, type DocColumn, type DocRow } from '@mivend/ui-kit';
import type { ProformaCard } from '../../api/proformaInvoiceCard';
import { documentMoney } from '../../utils/documentMoney';
import OrderLineProduct from '../order-detail/OrderLineProduct.vue';

const props = defineProps<{ card: ProformaCard }>();

const columns: DocColumn[] = [
    { key: 'product', label: 'Product' },
    { key: 'qty', label: 'Qty' },
    { key: 'price', label: 'Price' },
    { key: 'discount', label: 'Discount' },
    { key: 'total', label: 'Total' },
];
const money = computed(() => documentMoney(props.card.currencyCode));
const rows = computed(() =>
    props.card.lines.map((line, i): DocRow & { line: ProformaCard['lines'][number] } => ({
        id: String(i),
        testId: `proforma-line-${line.productVariant.sku}`,
        line,
    })),
);
const subtotal = computed(() => props.card.lines.reduce((s, l) => s + l.linePriceWithTax, 0));
const discount = computed(() => props.card.lines.reduce((s, l) => s + l.discountAmount, 0));
const totals = computed(() => [
    { key: 'positions', label: 'Positions', value: String(props.card.lines.length) },
    { key: 'subtotal', label: 'Subtotal', value: money.value(subtotal.value) },
    { key: 'discount', label: 'Discount total', value: money.value(discount.value) },
    { key: 'total', label: 'Total', value: money.value(props.card.amount), emphasis: true },
]);
</script>

<template>
    <MvDocumentLines title="Lines" :columns="columns" :rows="rows">
        <template #cell-product="{ row }">
            <OrderLineProduct
                :name="row.line.productVariant.name"
                :sku="row.line.productVariant.sku"
                :image="null"
            />
        </template>
        <template #cell-qty="{ row }">{{ row.line.quantity }}</template>
        <template #cell-price="{ row }">{{ money(row.line.unitPriceWithTax) }}</template>
        <template #cell-discount="{ row }">
            {{ row.line.discountAmount ? money(row.line.discountAmount) : '—' }}
        </template>
        <template #cell-total="{ row }">
            <strong>{{ money(row.line.linePriceWithTax - row.line.discountAmount) }}</strong>
        </template>
        <template #totals><MvDocumentTotals :rows="totals" /></template>
    </MvDocumentLines>
</template>
