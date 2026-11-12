<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvModal } from '@mivend/ui-kit';
import ProformaInvoicesPanel from './ProformaInvoicesPanel.vue';

const { t } = useI18n();
defineProps<{ orderId: string; orderCode: string; cancelled: boolean }>();
defineEmits<{ close: [] }>();
</script>

<template>
    <MvModal :title="t('orderDetail.actions.proformas')" @close="$emit('close')">
        <ProformaInvoicesPanel :order-id="orderId" :cancelled="cancelled" />
        <RouterLink
            :to="{ path: '/proforma-invoices', query: { search: orderCode } }"
            class="proforma-modal__link"
            @click="$emit('close')"
        >
            {{ t('orderDetail.actions.openInList') }}
        </RouterLink>
    </MvModal>
</template>

<style scoped>
.proforma-modal__link {
    display: inline-block;
    margin-top: 12px;
    color: var(--el-color-primary-dark-2);
    font-weight: 700;
}
</style>
