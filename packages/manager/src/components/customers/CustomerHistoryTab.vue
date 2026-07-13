<script setup lang="ts">
import type { EntityVersionRow } from '../../api/history';
import type { ManagerOption } from '../../api/orders';

const props = defineProps<{ history: EntityVersionRow[]; managers: ManagerOption[] }>();

function adminName(id: string | null): string {
    if (!id) return 'System';
    return props.managers.find(m => m.id === id)?.name ?? 'Unknown';
}

const ACTION_LABEL: Record<string, string> = {
    create: 'Created',
    update: 'Updated',
    deactivate: 'Deactivated',
    reactivate: 'Reactivated',
};

function summary(row: EntityVersionRow): string | null {
    if (!row.changedFields) return null;
    try {
        const fields = JSON.parse(row.changedFields) as Record<string, { from: unknown; to: unknown }>;
        return Object.keys(fields).join(', ');
    } catch {
        return null;
    }
}
</script>

<template>
    <ul v-if="history.length" class="history-tab">
        <li v-for="row in history" :key="row.id">
            <div class="history-tab__main">
                <strong>{{ ACTION_LABEL[row.action] ?? row.action }} — {{ row.entityName }}</strong>
                <span class="history-tab__meta">
                    by {{ adminName(row.administratorId) }}, {{ new Date(row.createdAt).toLocaleString('en-US') }}
                </span>
                <span v-if="summary(row)" class="history-tab__fields">Changed: {{ summary(row) }}</span>
            </div>
        </li>
    </ul>
    <p v-else class="history-tab__empty">No changes recorded yet</p>
</template>

<style scoped>
.history-tab {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.history-tab__main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 12px;
}

.history-tab__meta {
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.history-tab__fields {
    font-size: 12px;
    color: var(--el-text-color-secondary, #9ca3af);
}

.history-tab__empty {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}
</style>
