<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { OrderDetailLine } from '../../api/orderDetail';
import { fetchAvailableStock } from '../../api/reservation';
import { findingsByLine, type OrderCheckFinding } from '../../utils/orderCheckMessages';

const props = defineProps<{
    orderId: string;
    lines: OrderDetailLine[];
    findings: OrderCheckFinding[];
    refreshOn?: unknown;
}>();

const warehouseStock = ref<Map<string, number>>(new Map());
const byLine = computed(() => findingsByLine(props.findings));

async function loadStock(): Promise<void> {
    const ids = [...new Set(props.lines.map(l => l.productVariant.id))];
    const entries = await Promise.all(
        ids.map(async id => [id, await fetchAvailableStock(id, props.orderId)] as const),
    );
    warehouseStock.value = new Map(entries);
}

const rows = computed(() =>
    props.lines.map(line => {
        const stockFinding = (byLine.value.get(line.id) ?? []).find(
            f => f.facts.needed !== undefined,
        );
        const warehouse = warehouseStock.value.get(line.productVariant.id);
        return {
            id: line.id,
            name: line.productVariant.name,
            sku: line.productVariant.sku,
            ordered: line.quantity,
            warehouse,
            warehouseShort: warehouse !== undefined && warehouse < line.quantity,
            needed: stockFinding?.facts.needed ?? null,
            orgAvailable: stockFinding?.facts.available ?? null,
            storageStock: stockFinding?.facts.storageStock ?? null,
        };
    }),
);

onMounted(loadStock);
watch(() => [props.lines, props.refreshOn], loadStock);
</script>

<template>
    <div class="stock-context">
        <h3 class="stock-context__title">Stock per line</h3>
        <div class="stock-context__scroll">
            <table class="stock-context__table">
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Ordered</th>
                        <th>Warehouse stock</th>
                        <th>Needed (storage unit)</th>
                        <th>Organization stock</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in rows" :key="row.id">
                        <td>
                            {{ row.name }} <span class="stock-context__sku">{{ row.sku }}</span>
                        </td>
                        <td>{{ row.ordered }}</td>
                        <td :class="{ 'stock-context__short': row.warehouseShort }">
                            {{ row.warehouse ?? '—' }}
                        </td>
                        <td>{{ row.needed ?? '—' }}</td>
                        <td :class="{ 'stock-context__short': row.needed !== null }">
                            <template v-if="row.needed !== null">
                                {{ row.orgAvailable ?? 0 }}
                                <span class="stock-context__sku"
                                    >(storage organizations: {{ row.storageStock ?? 0 }})</span
                                >
                            </template>
                            <template v-else>No finding</template>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<style scoped>
.stock-context__title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 800;
}

.stock-context__scroll {
    overflow-x: auto;
}

.stock-context__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.stock-context__table th {
    text-align: left;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 8px 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.stock-context__table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.stock-context__sku {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}

.stock-context__short {
    color: var(--el-color-danger, #dc2626);
    font-weight: 700;
}
</style>
