<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { formatMoney } from './formatMoney';
import type { ProformaInvoiceDetail } from './useProformaInvoiceDetail';

defineProps<{ proformaInvoice: ProformaInvoiceDetail }>();
const { t } = useI18n();
</script>

<template>
    <div class="pil">
        <h2 class="pil-title">{{ t('proformaInvoices.detail.items') }}</h2>
        <table class="pil-table">
            <thead>
                <tr>
                    <th>{{ t('proformaInvoices.detail.sku') }}</th>
                    <th>{{ t('proformaInvoices.detail.product') }}</th>
                    <th class="pil-num">{{ t('proformaInvoices.detail.qty') }}</th>
                    <th class="pil-num">{{ t('proformaInvoices.detail.price') }}</th>
                    <th class="pil-num">{{ t('proformaInvoices.detail.lineTotal') }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(line, index) in proformaInvoice.lines" :key="index">
                    <td class="pil-sku">{{ line.productVariant.sku }}</td>
                    <td>{{ line.productVariant.name }}</td>
                    <td class="pil-num">{{ line.quantity }}</td>
                    <td class="pil-num">
                        {{ formatMoney(line.unitPriceWithTax, proformaInvoice.currencyCode) }}
                    </td>
                    <td class="pil-num pil-bold">
                        {{ formatMoney(line.linePriceWithTax, proformaInvoice.currencyCode) }}
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.pil {
    min-width: 0;
    overflow-x: auto;
    background: var(--app-surface);
    border: 1px solid var(--app-nav-border);
    border-radius: 20px;
    padding: 18px 20px;
}
.pil-title {
    margin: 0 0 14px;
    font-size: 20px;
    font-weight: 950;
    letter-spacing: -0.035em;
}
.pil-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.pil-table th {
    text-align: left;
    padding: 10px;
    background: var(--el-bg-color-page);
    color: var(--app-nav-label);
    font-weight: 850;
    font-size: 12px;
}
.pil-table td {
    padding: 12px 10px;
    border-bottom: 1px solid var(--app-nav-border);
}
.pil-table th.pil-num,
.pil-num {
    text-align: right;
    white-space: nowrap;
}
.pil-sku {
    color: var(--app-nav-label);
    font-weight: 850;
    white-space: nowrap;
}
.pil-bold {
    font-weight: 950;
}
</style>
