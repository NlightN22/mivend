<script setup lang="ts">
import { MvSidePanel, MvButton, MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import { computed, onMounted } from 'vue';
import { usePriceTypeNames } from '../../composables/usePriceTypeNames';
import { quickPanelRows } from './orderQuickPanelRows';
import type { OrderListRow } from './ordersListRows';

const props = defineProps<{ row: OrderListRow }>();
const emit = defineEmits<{ close: []; open: [code: string] }>();

const priceTypes = usePriceTypeNames();
onMounted(() => void priceTypes.load());
const rows = computed(() => quickPanelRows(props.row, priceTypes.names.value));
</script>

<template>
    <MvSidePanel
        :title="`Order ${formatDocumentNumber(row.code)}`"
        data-testid="order-quick-panel"
        @close="emit('close')"
    >
        <div class="order-quick-panel__badges">
            <MvStatusBadge :variant="row.stateVariant">{{ row.state }}</MvStatusBadge>
            <MvStatusBadge v-for="flag in row.flags" :key="flag.label" :variant="flag.variant">{{
                flag.label
            }}</MvStatusBadge>
        </div>
        <dl class="order-quick-panel__fields">
            <template v-for="item in rows" :key="item.label">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
            </template>
        </dl>
        <template #footer>
            <MvButton variant="ghost" size="sm" @click="emit('close')">Close</MvButton>
            <MvButton size="sm" @click="emit('open', row.code)">Open</MvButton>
        </template>
    </MvSidePanel>
</template>

<style scoped>
.order-quick-panel__badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
}

.order-quick-panel__fields {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 10px 12px;
    margin: 0;
}

.order-quick-panel__fields dt {
    color: var(--app-text-grey);
    font-size: 13px;
}

.order-quick-panel__fields dd {
    margin: 0;
    color: var(--app-nav-text-strong);
    overflow-wrap: anywhere;
}
</style>
