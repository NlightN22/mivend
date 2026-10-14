<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvCopyButton } from '@mivend/ui-kit';
import type { OrderDetail } from './useOrderDetail';
import { isNotRegisteredInErp } from './isNotRegisteredInErp';
import { formatDate } from './orderFormat';

defineProps<{ order: OrderDetail }>();
const { t } = useI18n();
</script>

<template>
    <div v-if="isNotRegisteredInErp(order.customFields)" class="odc">
        <h2 class="odc-title">{{ t('orders.detail.document') }}</h2>
        <div class="odc-row">
            <span class="odc-val">{{ t('orders.detail.notRegistered') }}</span>
        </div>
    </div>
    <div v-else-if="order.customFields?.erpRegistrationDocumentNumber" class="odc">
        <h2 class="odc-title">{{ t('orders.detail.document') }}</h2>
        <div v-if="order.customFields?.erpRegistrationDocumentNumber" class="odc-row">
            <span>{{ t('orders.detail.documentNumber') }}</span>
            <span class="odc-val">
                {{ order.customFields.erpRegistrationDocumentNumber }}
                <MvCopyButton
                    :value="order.customFields.erpRegistrationDocumentNumber"
                    :label="t('orders.detail.copyDocumentNumber')"
                />
            </span>
        </div>
        <div v-if="order.customFields?.erpStatusAt" class="odc-row">
            <span>{{ t('orders.detail.updated') }}</span>
            <span class="odc-val">{{ formatDate(order.customFields.erpStatusAt) }}</span>
        </div>
    </div>
</template>

<style scoped>
.odc {
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
}
.odc-title {
    margin: 0 0 14px;
    font-size: 16px;
    font-weight: 950;
    letter-spacing: -0.03em;
}
.odc-row {
    align-items: center;
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    font-size: 12px;
    color: #66736e;
}
.odc-val {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 850;
    color: #344640;
}
</style>
