<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { IconBox, IconBuilding, IconCoins, IconMapPin } from '@tabler/icons-vue';
import { MvIconStat } from '@mivend/ui-kit';

defineProps<{
    count: number;
    total: string;
    organization: string | null;
    pickupPoint: string | null;
}>();
const { t } = useI18n();

function productsLabel(n: number): string {
    const forms = ['товар', 'товара', 'товаров'];
    const mod100 = n % 100;
    const mod10 = n % 10;
    const form =
        mod100 >= 11 && mod100 <= 14 ? 2 : mod10 === 1 ? 0 : mod10 >= 2 && mod10 <= 4 ? 1 : 2;
    return `${n} ${forms[form]}`;
}
</script>

<template>
    <div class="oss">
        <MvIconStat
            class="oss-item"
            :icon="IconBox"
            :label="t('orders.detail.itemsCount')"
            :value="productsLabel(count)"
        />
        <MvIconStat
            class="oss-item"
            :icon="IconCoins"
            :label="t('orders.detail.orderTotal')"
            :value="total"
        />
        <MvIconStat
            v-if="organization"
            class="oss-item"
            :icon="IconBuilding"
            :label="t('orders.detail.organization')"
            :value="organization"
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
