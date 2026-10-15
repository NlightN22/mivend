<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { OrderDetail } from './useOrderDetail';

defineProps<{ address: OrderDetail['shippingAddress'] }>();
const { t } = useI18n();
</script>

<template>
    <div v-if="address?.streetLine1 || address?.fullName" class="od-address-card">
        <h2 class="od-section-title">{{ t('orders.detail.deliveryAddress') }}</h2>
        <div class="od-address-line">{{ address.fullName }}</div>
        <div class="od-address-line">{{ address.streetLine1 }}</div>
        <div v-if="address.streetLine2" class="od-address-line">{{ address.streetLine2 }}</div>
        <div class="od-address-line">
            {{ [address.city, address.postalCode].filter(Boolean).join(', ') }}
        </div>
    </div>
</template>

<style scoped>
.od-section-title {
    margin: 0 0 14px;
    font-size: 16px;
    font-weight: 950;
    letter-spacing: -0.03em;
}
.od-address-card {
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
}
.od-address-line {
    font-size: 13px;
    color: #344640;
    line-height: 1.55;
}
</style>
