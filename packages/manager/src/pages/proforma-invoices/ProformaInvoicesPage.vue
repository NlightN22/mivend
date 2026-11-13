<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ProformaInvoicesList from '../../components/proforma-invoices/ProformaInvoicesList.vue';

const { t } = useI18n();
</script>

<template>
    <div class="proforma-invoices-page">
        <div class="proforma-invoices-page__header">
            <div class="proforma-invoices-page__breadcrumb">
                {{ t('proformaInvoices.list.page.breadcrumb') }}
            </div>
            <h1 class="proforma-invoices-page__title">
                {{ t('proformaInvoices.list.page.title') }}
            </h1>
        </div>

        <ProformaInvoicesList />
    </div>
</template>

<style scoped>
.proforma-invoices-page__header {
    margin-bottom: 14px;
}

.proforma-invoices-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.proforma-invoices-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .proforma-invoices-page__breadcrumb {
        display: none;
    }

    .proforma-invoices-page__title {
        font-size: 22px;
    }
}
</style>
