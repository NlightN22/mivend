<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvStatusBadge } from '@mivend/ui-kit';
import ProformaInvoiceVersionBadge from '../proforma-invoices/ProformaInvoiceVersionBadge.vue';
import { formatMoney } from '../proforma-invoices/formatMoney';
import {
    PROFORMA_INVOICE_STATUS_LABEL,
    PROFORMA_INVOICE_STATUS_VARIANT,
} from '../proforma-invoices/useProformaInvoices';
import { useOrderProformaInvoices } from './useOrderProformaInvoices';

const props = defineProps<{ orderCode: string; cancelled: boolean }>();
const { t } = useI18n();
const { invoices, requesting, failed, load, request } = useOrderProformaInvoices(
    () => props.orderCode,
);
const changed = computed(() => invoices.value.filter(i => i.orderChangedDifference != null));

onMounted(() => void load());
</script>

<template>
    <div class="opi-card">
        <h2 class="opi-title">{{ t('orders.detail.proforma.title') }}</h2>
        <p v-if="!invoices.length" class="opi-empty">{{ t('orders.detail.proforma.empty') }}</p>
        <div v-for="invoice in invoices" :key="invoice.id" class="opi-row">
            <router-link :to="`/proforma-invoices/${invoice.id}`" class="opi-number"
                >№ {{ invoice.number }}</router-link
            >
            <ProformaInvoiceVersionBadge :version="invoice.version" />
            <MvStatusBadge
                :variant="PROFORMA_INVOICE_STATUS_VARIANT[invoice.displayStatus] ?? 'neutral'"
            >
                {{ PROFORMA_INVOICE_STATUS_LABEL[invoice.displayStatus] ?? invoice.displayStatus }}
            </MvStatusBadge>
            <span class="opi-amount">{{ formatMoney(invoice.amount, invoice.currencyCode) }}</span>
        </div>
        <p v-for="invoice in changed" :key="`d-${invoice.id}`" class="opi-diff">
            {{
                t('orders.detail.proforma.changedAfterPayment', {
                    number: invoice.number,
                    difference: formatMoney(
                        invoice.orderChangedDifference ?? 0,
                        invoice.currencyCode,
                    ),
                })
            }}
        </p>
        <MvButton
            v-if="!cancelled"
            variant="secondary"
            size="sm"
            :disabled="requesting"
            @click="request"
            >{{ t('orders.detail.proforma.request') }}</MvButton
        >
        <p v-if="failed" class="opi-diff">{{ t('orders.detail.proforma.failed') }}</p>
    </div>
</template>

<style scoped>
.opi-card {
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
    display: grid;
    gap: 10px;
}
.opi-title {
    margin: 0;
    font-size: 15px;
    font-weight: 900;
}
.opi-empty {
    margin: 0;
    color: #66736e;
    font-size: 13px;
}
.opi-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 13px;
}
.opi-number {
    font-weight: 850;
    color: #00a878;
    text-decoration: none;
}
.opi-amount {
    margin-left: auto;
    font-weight: 850;
}
.opi-diff {
    margin: 0;
    font-size: 12px;
    color: #92400e;
}
</style>
