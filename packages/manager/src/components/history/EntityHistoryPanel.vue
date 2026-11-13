<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvErrorState,
    MvStatusBadge,
    type AdvancedDataTableRowClickPayload,
} from '@mivend/ui-kit';
import type { EntityRef, EntityVersionRow } from '../../api/history';
import type { ManagerOption } from '../../api/orders';
import { useAuthStore } from '../../stores/auth';
import { useEntityHistoryList } from '../../composables/useEntityHistoryList';
import { useCardTabTable } from '../../composables/useCardTabTable';
import TableViewsMenu from '../TableViewsMenu.vue';
import EntityHistoryDetailModal from './EntityHistoryDetailModal.vue';
import { HISTORY_DEFAULT_SORT, buildHistoryColumns } from './historyColumns';
import { SYSTEM_CHANGER } from './historyFilter';
import { ACTION_BADGE_VARIANT, actionLabel, changeSummary } from './historyFormat';

// An audit trail of every EntityVersion-tracked object in `refs`; entityLabels names each entityName.
// Search, filters and paging are server-side on top of the scope-checked refs; the toolbar search
// matches the changed field names and the comment.
const props = withDefaults(
    defineProps<{
        refs: EntityRef[];
        managers: ManagerOption[];
        entityLabels?: Record<string, string>;
        urlPrefix?: string;
    }>(),
    { entityLabels: () => ({}), urlPrefix: 'history.' },
);

const { t } = useI18n();
const authStore = useAuthStore();
const list = useEntityHistoryList(() => props.refs, props.urlPrefix);

const entityLabel = (name: string): string => props.entityLabels[name] ?? name;
const changedByName = (id: string | null): string => {
    if (!id) return t('changeJournal.history.system');
    return props.managers.find(m => m.id === id)?.name ?? t('changeJournal.history.unknown');
};

const columns = computed(() =>
    buildHistoryColumns({
        actions: Object.keys(ACTION_BADGE_VARIANT).map(value => ({
            value,
            label: actionLabel(value),
        })),
        objects: Array.from(new Set(props.refs.map(r => r.entityName))).map(value => ({
            value,
            label: entityLabel(value),
        })),
        changedBy: [
            { value: SYSTEM_CHANGER, label: t('changeJournal.history.system') },
            ...props.managers.map(m => ({ value: m.id, label: m.name })),
        ],
    }),
);
const baseColumns = buildHistoryColumns({ actions: [], objects: [], changedBy: [] });

const { tableState, captureView, applyView, openedWithLink } = useCardTabTable({
    storageKey: `customer-history-v1:${authStore.administrator?.id ?? 'anonymous'}`,
    columns: baseColumns,
    list,
    urlPrefix: props.urlPrefix,
    defaultSort: HISTORY_DEFAULT_SORT,
});

const rows = computed(() =>
    list.items.value.map(row => ({
        id: row.id,
        summary: changeSummary(row),
        createdAt: row.createdAt as string,
        action: row.action,
        entityName: entityLabel(row.entityName),
        changedBy: changedByName(row.administratorId),
        version: row,
    })),
);
type Row = (typeof rows.value)[number];

const selected = ref<EntityVersionRow | null>(null);
function onRowClick(event: AdvancedDataTableRowClickPayload<Row>): void {
    selected.value = event.row.version;
}
function clearFilters(): void {
    list.search.value = '';
    list.conditions.value = [];
}
</script>

<template>
    <div class="entity-history">
        <MvAdvancedDataTable
            v-model:table-state="tableState"
            :columns="columns"
            :rows="rows"
            :loading="list.loading.value"
            :total-items="list.totalItems.value"
            :page="list.page.value"
            data-key="id"
            :row-height-px="49"
            :header-height-px="65"
            :search="{
                filterKey: 'search',
                placeholder: t('changeJournal.history.filters.search'),
            }"
            :conditions="list.conditions.value"
            :default-filters="{ search: '' }"
            :empty-message="t('changeJournal.history.emptyTable')"
            @update:conditions="list.conditions.value = $event"
            @update:page="list.page.value = $event"
            @reset-page="list.page.value = 1"
            @clear-filters="clearFilters"
            @row-click="onRowClick"
        >
            <template #empty>
                <MvErrorState
                    v-if="list.failed.value"
                    :title="t('changeJournal.history.loadFailedTitle')"
                    :message="t('changeJournal.history.loadFailedMessage')"
                    @retry="list.reload"
                />
                <template v-else>{{
                    list.loading.value ? '' : t('changeJournal.history.noMatch')
                }}</template>
            </template>

            <template #toolbar-end>
                <TableViewsMenu
                    views-key="customer-history"
                    :owner-key="authStore.administrator?.id ?? 'anonymous'"
                    :capture="captureView"
                    :apply="applyView"
                    :skip-restore="() => openedWithLink"
                />
            </template>

            <template #cell-createdAt="{ data }">
                <MvDateTimeCell :value="(data as Row).createdAt" />
            </template>
            <template #cell-action="{ data }">
                <MvStatusBadge :variant="ACTION_BADGE_VARIANT[(data as Row).action] ?? 'neutral'">
                    {{ actionLabel((data as Row).action) }}
                </MvStatusBadge>
            </template>
        </MvAdvancedDataTable>

        <EntityHistoryDetailModal
            v-if="selected"
            :row="selected"
            :object-label="entityLabel(selected.entityName)"
            :changed-by="changedByName(selected.administratorId)"
            @close="selected = null"
        />
    </div>
</template>
