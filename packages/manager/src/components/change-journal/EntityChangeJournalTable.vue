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
import type { ManagerOption } from '../../api/orders';
import { useAuthStore } from '../../stores/auth';
import { useCardTabTable } from '../../composables/useCardTabTable';
import { useEntityJournalList } from '../../composables/useEntityJournalList';
import {
    changeLines,
    formatAction,
    formatActor,
    formatSource,
} from '../../utils/changeJournalFormat';
import TableViewsMenu from '../TableViewsMenu.vue';
import {
    ACTION_LABELS,
    ACTOR_TYPE_LABELS,
    CHANGE_JOURNAL_LABELS as L,
} from './changeJournalLabels';
import JournalEntryDetailModal from './JournalEntryDetailModal.vue';
import {
    JOURNAL_DEFAULT_SORT,
    NO_JOURNAL_OPTIONS,
    buildJournalColumns,
} from './journalTabFilter';

// The change journal of one entity (the customer card tab). Requires ReadChangeJournal on the server,
// which also refuses an entity outside the viewer's scope; the filters only narrow that entity's entries.
const props = defineProps<{
    entityType: string;
    entityId: string;
    managers: ManagerOption[];
    urlPrefix?: string;
}>();

const ACTION_VARIANT: Record<string, 'success' | 'info' | 'danger' | 'neutral'> = {
    insert: 'success',
    update: 'info',
    'soft-remove': 'danger',
    remove: 'danger',
    recover: 'success',
};

const { t } = useI18n();
const authStore = useAuthStore();
const prefix = props.urlPrefix ?? 'journal.';
const list = useEntityJournalList(props.entityType, () => props.entityId, prefix);

const adminName = (id: string): string | null =>
    props.managers.find(m => m.id === id)?.name ?? null;

const columns = computed(() =>
    buildJournalColumns({
        actions: Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
        actors: Object.entries(ACTOR_TYPE_LABELS).map(([value, label]) => ({ value, label })),
        administrators: props.managers.map(m => ({ value: m.id, label: m.name })),
    }),
);
const ownerKey = authStore.administrator?.id ?? 'anonymous';
const { tableState, captureView, applyView, openedWithLink } = useCardTabTable({
    storageKey: `customer-journal-v1:${ownerKey}`,
    columns: buildJournalColumns(NO_JOURNAL_OPTIONS),
    hiddenColumns: ['source'],
    list,
    urlPrefix: prefix,
    defaultSort: JOURNAL_DEFAULT_SORT,
});

const rows = computed(() =>
    list.items.value.map(entry => ({
        id: entry.id,
        summary:
            changeLines(entry.changes)
                .map(l => l.field)
                .join(', ') || '—',
        occurredAt: entry.occurredAt as string,
        action: entry.action,
        actor: formatActor(entry, adminName),
        administrator: entry.administratorId
            ? (adminName(entry.administratorId) ?? `#${entry.administratorId}`)
            : '—',
        source: formatSource(entry.source),
        entry,
    })),
);
type Row = (typeof rows.value)[number];

const selected = ref<Row | null>(null);
function onRowClick(event: AdvancedDataTableRowClickPayload<Row>): void {
    selected.value = event.row;
}
function clearFilters(): void {
    list.search.value = '';
    list.conditions.value = [];
}
const errorMessage = computed(() =>
    list.error.value === 'forbidden' ? L.errorForbidden : undefined,
);
</script>

<template>
    <div class="entity-change-journal">
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
                placeholder: t('changeJournal.tab.searchPlaceholder'),
            }"
            :conditions="list.conditions.value"
            :default-filters="{ search: '' }"
            :empty-message="L.empty"
            @update:conditions="list.conditions.value = $event"
            @update:page="list.page.value = $event"
            @reset-page="list.page.value = 1"
            @clear-filters="clearFilters"
            @row-click="onRowClick"
        >
            <template #empty>
                <MvErrorState
                    v-if="list.error.value"
                    :title="L.errorTitle"
                    :message="errorMessage"
                    :retry-label="L.retry"
                    @retry="list.reload"
                />
                <template v-else>{{
                    list.loading.value ? '' : t('changeJournal.tab.noMatch')
                }}</template>
            </template>

            <template #toolbar-end>
                <TableViewsMenu
                    views-key="customer-journal"
                    :owner-key="ownerKey"
                    :capture="captureView"
                    :apply="applyView"
                    :skip-restore="() => openedWithLink"
                />
            </template>

            <template #cell-occurredAt="{ data }">
                <MvDateTimeCell :value="(data as Row).occurredAt" />
            </template>
            <template #cell-action="{ data }">
                <MvStatusBadge :variant="ACTION_VARIANT[(data as Row).action] ?? 'neutral'">
                    {{ formatAction((data as Row).action) }}
                </MvStatusBadge>
            </template>
        </MvAdvancedDataTable>

        <JournalEntryDetailModal
            v-if="selected"
            :entry="selected.entry"
            :actor="selected.actor"
            :source="selected.source"
            @close="selected = null"
        />
    </div>
</template>
