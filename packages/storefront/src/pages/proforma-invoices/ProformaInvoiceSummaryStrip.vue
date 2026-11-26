<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { IconBox, IconCalendarDue, IconCoins } from '@tabler/icons-vue';
import { MvIconStat } from '@mivend/ui-kit';

defineProps<{ count: number; total: string; dueDate: string }>();
const { t } = useI18n();
</script>

<template>
    <div class="pis">
        <MvIconStat
            class="pis-item"
            :icon="IconBox"
            :label="t('orders.detail.itemsCount')"
            :value="t('orders.detail.itemsCountValue', count)"
        />
        <MvIconStat
            class="pis-item"
            :icon="IconCoins"
            :label="t('proformaInvoices.detail.total')"
            :value="total"
        />
        <MvIconStat
            class="pis-item"
            :icon="IconCalendarDue"
            :label="t('proformaInvoices.detail.payBy')"
            :value="dueDate"
        />
    </div>
</template>

<style scoped>
.pis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 1px;
    margin-bottom: 18px;
    background: var(--app-nav-border);
    border: 1px solid var(--app-nav-border);
    border-radius: 20px;
    overflow: hidden;
}
.pis-item {
    padding: 14px 18px;
    background: var(--app-surface);
}
</style>
