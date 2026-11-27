<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvButton } from '@mivend/ui-kit';
import ProformaInvoiceCard from './ProformaInvoiceCard.vue';

defineProps<{
    payTo: string | null;
    payDisabled: boolean;
    pdfReady: boolean;
    orderId: string | null;
    cancelled: boolean;
}>();
defineEmits<{ downloadPdf: [] }>();
const { t } = useI18n();
</script>

<template>
    <ProformaInvoiceCard :title="t('proformaInvoices.detail.actions')">
        <div class="pia">
            <p v-if="cancelled" class="pia-note">{{ t('proformaInvoices.detail.cancelled') }}</p>
            <MvButton v-if="payDisabled" variant="primary" disabled>{{
                t('proformaInvoices.detail.pay')
            }}</MvButton>
            <router-link v-else-if="payTo" :to="payTo">
                <MvButton variant="primary">{{ t('proformaInvoices.detail.pay') }}</MvButton>
            </router-link>
            <MvButton variant="secondary" :disabled="!pdfReady" @click="$emit('downloadPdf')">{{
                t('proformaInvoices.detail.downloadPdf')
            }}</MvButton>
            <router-link v-if="orderId" :to="`/orders/${orderId}`">
                <MvButton variant="secondary">{{
                    t('proformaInvoices.detail.openOrder')
                }}</MvButton>
            </router-link>
        </div>
    </ProformaInvoiceCard>
</template>

<style scoped>
.pia {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
}
.pia a {
    display: block;
}
.pia :deep(.mv-button) {
    width: 100%;
}
.pia-note {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--app-orange-fg);
}
</style>
