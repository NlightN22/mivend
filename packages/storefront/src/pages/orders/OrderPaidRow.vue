<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ paid: string; total: string; overpaid: string | null }>();
const { t } = useI18n();
</script>

<template>
    <div class="od-paid" :title="t('orders.detail.paidHint')" data-testid="order-paid">
        <span>{{ t('orders.detail.paid') }}</span>
        <span v-if="overpaid">{{ t('orders.detail.paidInFull', { overpaid }) }}</span>
        <span v-else>{{ t('orders.detail.paidOf', { paid, total }) }}</span>
    </div>
</template>

<style scoped>
.od-paid {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    padding: 5px 0;
    color: #344640;
}
</style>
