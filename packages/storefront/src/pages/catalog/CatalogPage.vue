<template>
    <div class="catalog-page">
        <MvPageHeader :title="t('catalog.title')" />

        <div class="catalog-page__search">
            <MvSearchInput
                v-model="searchQuery"
                :placeholder="t('catalog.search')"
                :loading="searching"
                @search="onSearch"
                @clear="onClear"
            />
        </div>

        <MvTable
            :columns="columns"
            :data="rows"
            :loading="searching"
            :height="480"
            :empty-text="t('catalog.noResults')"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { h } from 'vue';
import type { Column } from 'element-plus';
import type { TableRow } from '@mivend/ui-kit';
import MvAmountDisplay from '@mivend/ui-kit/src/components/MvAmountDisplay/MvAmountDisplay.vue';
import MvStatusTag from '@mivend/ui-kit/src/components/MvStatusTag/MvStatusTag.vue';
import MvButton from '@mivend/ui-kit/src/components/MvButton/MvButton.vue';
import type { StatusTagVariant } from '@mivend/ui-kit/src/components/MvStatusTag/MvStatusTag.vue';

const { t } = useI18n();

const searchQuery = ref('');
const searching = ref(false);

const STUB_ROWS: TableRow[] = [
    { article: 'OC90', name: 'Oil filter', brand: 'Mahle', price: 420, _rowState: 'in-stock' },
    { article: '0986494063', name: 'Brake pads front', brand: 'Bosch', price: 2940, _rowState: 'low-stock' },
    { article: '5W40-4L', name: 'Motor oil 4L', brand: 'Total', price: 2180, _rowState: 'in-stock' },
    { article: 'CR-35L', name: 'Air filter', brand: 'Mann', price: 890, _rowState: 'by-order' },
    { article: 'BX-7710', name: 'Timing belt kit', brand: 'Gates', price: 4650, _rowState: 'unavailable' },
];

const STATE_TAG_MAP: Record<string, StatusTagVariant> = {
    'in-stock': 'in-stock',
    'low-stock': 'low-stock',
    'by-order': 'by-order',
    unavailable: 'unavailable',
    'in-cart': 'in-cart',
    reserved: 'reserved',
    analog: 'analog',
};

const columns: Column<TableRow>[] = [
    { key: 'article', title: 'Article', dataKey: 'article', width: 120 },
    { key: 'name', title: 'Product', dataKey: 'name', width: 260 },
    { key: 'brand', title: 'Brand', dataKey: 'brand', width: 110 },
    {
        key: 'status',
        title: 'Status',
        dataKey: '_rowState',
        width: 130,
        cellRenderer: ({ rowData }) => {
            const state = (rowData as TableRow)._rowState;
            const variant = state ? STATE_TAG_MAP[state] : undefined;
            return variant ? h(MvStatusTag, { variant }) : h('span');
        },
    },
    {
        key: 'price',
        title: 'Price',
        dataKey: 'price',
        width: 130,
        align: 'right',
        cellRenderer: ({ cellData }) =>
            h(MvAmountDisplay, { amount: cellData as unknown as number, currency: '₽', size: 'md' }),
    },
    {
        key: 'action',
        title: '',
        dataKey: 'article',
        width: 120,
        cellRenderer: () => h(MvButton, { variant: 'buy', size: 'sm' }, () => t('catalog.addToCart')),
    },
];

const rows = shallowRef<TableRow[]>(STUB_ROWS);

function onSearch(query: string): void {
    searching.value = true;
    setTimeout(() => {
        rows.value = STUB_ROWS.filter(
            (r) =>
                String(r.article).toLowerCase().includes(query.toLowerCase()) ||
                String(r.name).toLowerCase().includes(query.toLowerCase()),
        );
        searching.value = false;
    }, 400);
}

function onClear(): void {
    rows.value = STUB_ROWS;
}
</script>

<style scoped>
.catalog-page {
    padding: 0 4px;
}
.catalog-page__search {
    margin-bottom: 20px;
    max-width: 680px;
}
</style>
