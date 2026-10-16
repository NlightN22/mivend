<script setup lang="ts">
import type { OrderLineAvailability } from '../../api/orderLineEdit';

defineProps<{ availability: OrderLineAvailability }>();
</script>

<template>
    <div class="sources">
        <p class="sources__head">
            Needed {{ availability.needed }}, fits now {{ availability.fitting }}
        </p>
        <p v-if="availability.limitedBy" class="sources__limit">
            Limited by
            {{
                availability.limitedBy === 'organization'
                    ? 'the selling organization'
                    : 'the warehouse'
            }}
        </p>
        <ul v-if="availability.warehouses.length" class="sources__list">
            <li class="sources__title">Warehouses (free)</li>
            <li v-for="w in availability.warehouses" :key="w.warehouseErpId">
                <span>{{ w.name ?? w.warehouseErpId }}</span>
                <span :class="{ sources__bad: w.free < availability.needed }">
                    {{ w.free }} / {{ availability.needed }}
                </span>
            </li>
        </ul>
        <ul v-if="availability.organizations.length" class="sources__list">
            <li class="sources__title">Organizations (stock)</li>
            <li
                v-for="o in availability.organizations"
                :key="o.id"
                :class="{ sources__sell: o.selling }"
            >
                <span>{{ o.name ?? o.id }}<em v-if="o.selling"> · sells this line</em></span>
                <span :class="{ sources__bad: o.selling && o.stock < availability.needed }">
                    {{ o.stock }}<template v-if="o.selling"> / {{ availability.needed }}</template>
                </span>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.sources__head {
    margin: 0 0 4px;
    font-weight: 700;
}

.sources__limit {
    margin: 0 0 4px;
    color: var(--el-color-danger, #dc2626);
}

.sources__list {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
}

.sources__list li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
    border-top: 1px solid var(--el-border-color-lighter, #eef0f3);
}

.sources__title {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--el-text-color-secondary, #6b7280);
}

.sources__sell {
    font-weight: 700;
}

.sources__sell em {
    font-style: normal;
    font-weight: 400;
}

.sources__bad {
    color: var(--el-color-danger, #dc2626);
    font-weight: 700;
}
</style>
