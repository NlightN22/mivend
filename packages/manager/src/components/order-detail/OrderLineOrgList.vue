<script setup lang="ts">
import type { OrgRow } from '../../utils/orderLineChecks';

defineProps<{ rows: OrgRow[]; mode: 'stock' | 'contract' }>();
</script>

<template>
    <ul class="org-list">
        <li v-for="row in rows" :key="row.id" :class="{ 'org-list__row--selling': row.selling }">
            <span
                v-if="mode === 'contract'"
                class="org-list__dot"
                :class="{ 'org-list__dot--bad': !row.hasContract }"
            ></span>
            <span class="org-list__name">
                {{ row.name }}<em v-if="row.selling"> · sells this line</em>
            </span>
            <span v-if="mode === 'stock'" class="org-list__value">{{ row.stock }}</span>
            <span v-else class="org-list__value">
                {{ row.hasContract ? 'contract' : 'no contract' }}
            </span>
        </li>
    </ul>
</template>

<style scoped>
.org-list {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
}

.org-list li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
    border-top: 1px solid var(--el-border-color-lighter, #eef0f3);
}

.org-list__row--selling {
    font-weight: 700;
}

.org-list__name {
    flex: 1;
}

.org-list__name em {
    font-style: normal;
    font-weight: 400;
    color: var(--el-text-color-secondary, #6b7280);
}

.org-list__value {
    text-align: right;
}

.org-list__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--el-color-success, #059669);
}

.org-list__dot--bad {
    background: var(--el-color-danger, #dc2626);
}
</style>
