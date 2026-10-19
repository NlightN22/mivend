<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { IconBox, IconCoins, IconMapPin } from '@tabler/icons-vue';
import { MvIconStat } from '@mivend/ui-kit';

defineProps<{
    count: number;
    total: string;
    pickupPoint: string | null;
}>();
const { t } = useI18n();
</script>

<template>
    <div class="oss">
        <MvIconStat
            class="oss-item"
            :icon="IconBox"
            :label="t('orders.detail.itemsCount')"
            :value="t('orders.detail.itemsCountValue', count)"
        />
        <MvIconStat
            class="oss-item"
            :icon="IconCoins"
            :label="t('orders.detail.orderTotal')"
            :value="total"
        />
        <MvIconStat
            v-if="pickupPoint"
            class="oss-item"
            :icon="IconMapPin"
            :label="t('orders.detail.pickupPoint')"
            :value="pickupPoint"
        />
    </div>
</template>

<style scoped>
.oss {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 1px;
    margin-bottom: 18px;
    background: #edf2ef;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    overflow: hidden;
}
.oss-item {
    padding: 14px 18px;
    background: #fff;
}
</style>
