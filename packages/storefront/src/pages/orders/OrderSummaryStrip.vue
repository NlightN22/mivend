<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
    count: number;
    total: string;
    organization: string | null;
    pickupPoint: string | null;
}>();
const { t } = useI18n();
</script>

<template>
    <div class="oss">
        <div class="oss-item">
            <span class="oss-label">{{ t('orders.detail.itemsCount') }}</span>
            <span class="oss-value">{{ t('orders.detail.itemsValue', { n: count }) }}</span>
        </div>
        <div class="oss-item">
            <span class="oss-label">{{ t('orders.detail.orderTotal') }}</span>
            <span class="oss-value">{{ total }}</span>
        </div>
        <div v-if="organization" class="oss-item">
            <span class="oss-label">{{ t('orders.detail.organization') }}</span>
            <span class="oss-value">{{ organization }}</span>
        </div>
        <div v-if="pickupPoint" class="oss-item">
            <span class="oss-label">{{ t('orders.detail.pickupPoint') }}</span>
            <span class="oss-value">{{ pickupPoint }}</span>
        </div>
    </div>
</template>

<style scoped>
.oss {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1px;
    margin-bottom: 18px;
    background: #edf2ef;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    overflow: hidden;
}
.oss-item {
    display: grid;
    gap: 4px;
    padding: 14px 18px;
    background: #fff;
}
.oss-label {
    color: #66736e;
    font-size: 12px;
}
.oss-value {
    font-size: 14px;
    font-weight: 950;
    color: #1b2d26;
}
</style>
