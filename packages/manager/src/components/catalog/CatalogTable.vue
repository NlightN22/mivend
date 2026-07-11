<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { CatalogListItem, FacetValueOption } from '../../api/catalog';

const props = defineProps<{
    items: CatalogListItem[];
    categories: FacetValueOption[];
    brands: FacetValueOption[];
    stock: Map<string, number>;
    priceColumns: { priceTypeCode: string; label: string; prices: Map<string, number> }[];
    floorPrices: Map<string, number> | null;
}>();
const router = useRouter();

function facetName(facetValueIds: string[], options: FacetValueOption[]): string {
    const match = options.find(o => facetValueIds.includes(o.id));
    return match?.name ?? '—';
}

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        amount / 100,
    );
}

const columns = computed<Column<TableRow>[]>(() => {
    const cols: Column<TableRow>[] = [
        { key: 'sku', title: 'SKU', dataKey: 'sku', width: 150 },
        { key: 'name', title: 'Product name', dataKey: 'name', width: 240 },
        { key: 'category', title: 'Category', dataKey: 'category', width: 160 },
        { key: 'brand', title: 'Brand', dataKey: 'brand', width: 130 },
        { key: 'stock', title: 'Stock', dataKey: 'stock', width: 100, align: 'right' },
    ];
    for (const col of props.priceColumns) {
        cols.push({
            key: col.priceTypeCode,
            title: col.label,
            dataKey: col.priceTypeCode,
            width: 140,
            align: 'right',
        });
    }
    // Only rendered when the caller has ReadFloorPrice — see api/catalog.ts
    // fetchPriceEntriesForVariants, which returns null on a forbidden lookup.
    if (props.floorPrices) {
        cols.push({ key: 'floorPrice', title: 'Floor price', dataKey: 'floorPrice', width: 140, align: 'right' });
    }
    return cols;
});

const rows = computed<TableRow[]>(() =>
    props.items.map(item => {
        const stock = props.stock.get(item.productVariantId);
        const row: TableRow = {
            sku: item.sku,
            name: item.productName,
            category: facetName(item.facetValueIds, props.categories),
            brand: facetName(item.facetValueIds, props.brands),
            stock: stock !== undefined ? stock : '—',
            _slug: item.slug,
        };
        for (const col of props.priceColumns) {
            const price = col.prices.get(item.productVariantId);
            row[col.priceTypeCode] = price !== undefined ? money(price) : '—';
        }
        if (props.floorPrices) {
            const floor = props.floorPrices.get(item.productVariantId);
            row.floorPrice = floor !== undefined ? money(floor) : '—';
        }
        return row;
    }),
);

function handleRowClick({ rowData }: { rowData: TableRow }): void {
    router.push(`/catalog/${rowData._slug as string}`);
}
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, 1) * 52 + 40"
        empty-text="No products match your filters"
        @row-click="handleRowClick"
    />
</template>
