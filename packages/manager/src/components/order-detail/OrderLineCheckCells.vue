<script setup lang="ts">
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-vue';
import { MvTooltip } from '@mivend/ui-kit';
import type { LineCheckView } from '../../utils/orderLineChecks';

defineProps<{ view: LineCheckView }>();
</script>

<template>
    <td class="line-check__cell" :class="{ 'line-check__cell--bad': view.stockShort }">
        <MvTooltip trigger="hover" placement="bottom">
            <template #trigger>
                <span class="line-check__value" tabindex="0">{{
                    view.warehouseAvailable ?? '—'
                }}</span>
            </template>
            <p class="line-check__head">
                Available stock: {{ view.warehouseAvailable ?? '—' }}. Needed: {{ view.needed }}
            </p>
            <template v-if="view.stockTitle">
                <p class="line-check__note">{{ view.stockTitle }} (ERP-mandated control).</p>
                <p class="line-check__note">
                    At the organizations holding the storage place: {{ view.storageStock ?? 0 }}.
                    Counted for this buyer: {{ view.eligibleStock ?? 0 }}
                    <template v-if="view.eligibleNames.length">
                        ({{ view.eligibleNames.join(', ') }})</template
                    >.
                </p>
            </template>
            <p v-else class="line-check__note">No ERP stock finding for this line.</p>
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
            <ul v-if="view.orgRows.length" class="line-check__orgs">
                <li v-for="row in view.orgRows" :key="row.id">
                    <span
                        class="line-check__dot"
                        :class="{ 'line-check__dot--bad': !row.hasContract }"
                    ></span>
                    {{ row.name }} — {{ row.hasContract ? 'contract' : 'no contract' }}
                </li>
            </ul>
            <p v-else class="line-check__note">No storage organization is known for this line.</p>
        </MvTooltip>
    </td>
</template>

<style scoped>
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

.line-check__orgs {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
}

.line-check__dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--el-color-success, #059669);
    margin-right: 6px;
}

.line-check__dot--bad {
    background: var(--el-color-danger, #dc2626);
}
</style>
