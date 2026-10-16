<script setup lang="ts">
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-vue';
import { MvTooltip } from '@mivend/ui-kit';
import type { LineCheckView } from '../../utils/orderLineChecks';
import OrderLineOrgList from './OrderLineOrgList.vue';

defineProps<{ view: LineCheckView; reserved: number }>();
</script>

<template>
    <td class="line-check__cell" :class="{ 'line-check__cell--bad': view.stockShort }">
        <MvTooltip trigger="hover" placement="bottom">
            <template #trigger>
                <span class="line-check__value" tabindex="0">{{ view.available ?? '—' }}</span>
            </template>
            <p class="line-check__head">
                Available stock: {{ view.available ?? '—' }}. Needed: {{ view.needed }}
            </p>
            <p v-if="view.stockTitle" class="line-check__note">
                {{ view.stockTitle }} (ERP-mandated control).
            </p>
            <p v-else class="line-check__note">No ERP stock finding for this line.</p>
            <OrderLineOrgList v-if="view.orgRows.length" :rows="view.orgRows" mode="stock" />
        </MvTooltip>
    </td>
    <td class="line-check__cell">{{ view.needed }}</td>
    <td class="line-check__cell" :class="{ 'line-check__cell--bad': !view.contractOk }">
        <MvTooltip trigger="hover" placement="bottom">
            <template #trigger>
                <span class="line-check__value" tabindex="0">
                    {{ view.allowed }} / {{ view.needed }}
                    <IconAlertTriangle
                        v-if="!view.contractOk"
                        :size="15"
                        class="line-check__warn"
                    />
                    <IconCircleCheck v-else :size="15" class="line-check__ok" />
                </span>
            </template>
            <p class="line-check__head">
                Allowed by contract: {{ view.allowed }} / {{ view.needed }}
            </p>
            <p v-if="view.contractTitle" class="line-check__note">
                {{ view.contractTitle }} (ERP-mandated control).
            </p>
            <OrderLineOrgList v-if="view.orgRows.length" :rows="view.orgRows" mode="contract" />
            <p v-else class="line-check__note">No ERP contract finding for this line.</p>
        </MvTooltip>
    </td>
    <td class="line-check__cell">
        <span class="line-check__plain">
            {{ reserved }}
            <IconCircleCheck v-if="reserved >= view.needed" :size="15" class="line-check__ok" />
        </span>
    </td>
</template>

<style scoped>
.line-check__cell {
    text-align: center;
}

.line-check__cell--bad {
    background: rgba(220, 38, 38, 0.06);
    color: var(--el-color-danger, #dc2626);
    font-weight: 700;
}

.line-check__value {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: help;
}

.line-check__plain {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.line-check__warn {
    color: var(--el-color-warning, #d97706);
}

.line-check__ok {
    color: var(--el-color-success, #059669);
}

.line-check__head {
    margin: 0 0 4px;
    font-weight: 700;
}

.line-check__note {
    margin: 0 0 4px;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
