<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { formatDocumentNumber } from '@mivend/ui-kit';
import ProformaInvoiceCard from './ProformaInvoiceCard.vue';

defineProps<{ order: { id: string; code: string } }>();
const { t } = useI18n();
</script>

<template>
    <ProformaInvoiceCard :title="t('proformaInvoices.detail.linkedOrder')">
        <router-link :to="`/orders/${order.id}`" class="pio-link">{{
            formatDocumentNumber(order.code)
        }}</router-link>
    </ProformaInvoiceCard>
</template>

<style scoped>
.pio-link {
    font-size: 14px;
    font-weight: 850;
    color: var(--app-nav-accent);
    text-decoration: none;
}
.pio-link:hover {
    text-decoration: underline;
}
</style>
