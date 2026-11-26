<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ProformaInvoiceCard from './ProformaInvoiceCard.vue';

defineProps<{ count: number; total: string }>();
const { t } = useI18n();
</script>

<template>
    <ProformaInvoiceCard :title="t('proformaInvoices.detail.totals')">
        <div class="pit-row">
            <span>{{ t('orders.detail.itemsCount') }}</span>
            <span>{{ count }}</span>
        </div>
        <div class="pit-row pit-total">
            <span>{{ t('proformaInvoices.detail.total') }}</span>
            <span>{{ total }}</span>
        </div>
    </ProformaInvoiceCard>
</template>

<style scoped>
.pit-row {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    font-size: 13px;
    color: var(--app-text-body2);
}
.pit-total {
    margin-top: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--app-nav-border);
    font-weight: 950;
    font-size: 16px;
}
</style>
