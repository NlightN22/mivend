<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
    MvAdvancedDataTable,
    MvStatusBadge,
    MvDateTimeCell,
    MvButton,
    MvInput,
    useDataTableState,
    type AdvancedDataTableColumn,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import type { NotificationItem } from '@mivend/ui-kit';
import { NOTIFICATION_STATUS_OPTIONS, NOTIFICATION_STATUS_BADGE_VARIANT } from '../../api/notifications';

// See manager-table-standard skill. `title` is the identifying/required column (what a user
// searches by first for a notification), backed by the backend's real `search` filter (title
// ILIKE — issue #92). `status` gets a real status-type filter with badge variants shared with
// the page's own view chips (NOTIFICATION_STATUS_BADGE_VARIANT). `message`/`sourceType` have no
// filter — the backend has no reason to filter by either, message is free text shown for context
// only and sourceType is an internal producer identifier, not something a user searches by.
const props = defineProps<{
    notifications: NotificationItem[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    statusFilter: string;
    searchFilter: string;
    administratorId: string;
    actingId: string | null;
}>();

const emit = defineEmits<{
    'update:filters': [filters: { status: string; search: string }];
    'update:page': [page: number];
    'update:page-size': [size: number];
    markRead: [id: string];
    resolve: [id: string, resolution: string];
}>();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'title',
        header: 'Notification',
        width: 260,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Title contains…' },
        mobile: { primary: true },
    },
    { field: 'createdAt', header: 'Date', width: 140, filterConfig: { type: 'none' } },
    {
        field: 'status',
        header: 'Status',
        width: 130,
        filterConfig: {
            type: 'status',
            placeholder: 'All statuses',
            options: NOTIFICATION_STATUS_OPTIONS.filter(o => o.value).map(o => ({
                value: o.value,
                label: o.label,
                variant: NOTIFICATION_STATUS_BADGE_VARIANT[o.value as 'unread' | 'read' | 'resolved'],
            })),
        },
        mobile: { badge: true },
    },
    { field: 'sourceType', header: 'Source', width: 180, filterConfig: { type: 'none' }, mobile: { hidden: true } },
    { field: 'message', header: 'Message', width: 320, filterConfig: { type: 'none' } },
    { field: 'actions', header: '', width: 200, filterConfig: { type: 'none' } },
];

interface NotificationFilterState {
    [key: string]: unknown;
    status: string;
    title: string;
}
const BLANK_FILTERS: NotificationFilterState = { status: '', title: '' };

const { state: tableState } = useDataTableState<NotificationFilterState>(
    `notifications-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { status: props.statusFilter, title: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => c.field),
        externallyOwned: { pageSize: true, filterKeys: ['status', 'title'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { status: f.status, search: f.title }),
    { deep: true },
);
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));
watch(() => props.statusFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, status: v };
});
watch(() => props.searchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, title: v };
});
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

interface NotificationRow {
    [key: string]: unknown;
    id: string;
    title: string;
    createdAt: string;
    status: string;
    statusVariant: StatusBadgeVariant;
    sourceType: string;
    message: string;
}
const rows = computed<NotificationRow[]>(() =>
    props.notifications.map(n => ({
        id: n.id,
        title: n.title,
        createdAt: n.createdAt,
        status: n.status,
        statusVariant: NOTIFICATION_STATUS_BADGE_VARIANT[n.status],
        sourceType: n.sourceType,
        message: n.message,
    })),
);

const resolvingId = ref<string | null>(null);
const resolutionDraft = ref('');

function startResolve(id: string): void {
    resolvingId.value = id;
    resolutionDraft.value = '';
}
function cancelResolve(): void {
    resolvingId.value = null;
    resolutionDraft.value = '';
}
function confirmResolve(id: string): void {
    if (!resolutionDraft.value.trim()) return;
    emit('resolve', id, resolutionDraft.value.trim());
    cancelResolve();
}
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="ALL_COLUMNS"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="56"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'title', placeholder: 'Search notifications…' }"
        empty-message="No notifications match your filters"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #cell-createdAt="{ data }">
            <MvDateTimeCell :value="(data as NotificationRow).createdAt" />
        </template>
        <template #cell-status="{ data }">
            <MvStatusBadge :variant="(data as NotificationRow).statusVariant">
                {{ (data as NotificationRow).status }}
            </MvStatusBadge>
        </template>
        <template #cell-message="{ data }">
            <span class="notifications-data-table__message">{{ (data as NotificationRow).message }}</span>
        </template>
        <template #cell-actions="{ data }">
            <div v-if="resolvingId !== (data as NotificationRow).id" class="notifications-data-table__actions">
                <button
                    v-if="(data as NotificationRow).status === 'unread'"
                    type="button"
                    class="notifications-data-table__link"
                    :disabled="actingId === (data as NotificationRow).id"
                    @click="emit('markRead', (data as NotificationRow).id)"
                >
                    Mark read
                </button>
                <button
                    v-if="(data as NotificationRow).status !== 'resolved'"
                    type="button"
                    class="notifications-data-table__link"
                    :disabled="actingId === (data as NotificationRow).id"
                    @click="startResolve((data as NotificationRow).id)"
                >
                    Resolve
                </button>
            </div>
            <div v-else class="notifications-data-table__resolve-form">
                <MvInput
                    v-model="resolutionDraft"
                    placeholder="Resolution note"
                    size="sm"
                    @keyup.enter="confirmResolve((data as NotificationRow).id)"
                />
                <MvButton
                    variant="ghost"
                    size="sm"
                    :disabled="!resolutionDraft.trim()"
                    @click="confirmResolve((data as NotificationRow).id)"
                >
                    OK
                </MvButton>
                <MvButton variant="ghost" size="sm" @click="cancelResolve">Cancel</MvButton>
            </div>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.notifications-data-table__message {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}

.notifications-data-table__actions {
    display: flex;
    gap: 12px;
}

.notifications-data-table__link {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    color: var(--el-color-primary-dark-2, #008a70);
}

.notifications-data-table__link:disabled {
    opacity: 0.5;
    cursor: default;
}

.notifications-data-table__resolve-form {
    display: flex;
    align-items: center;
    gap: 6px;
}

.notifications-data-table__resolve-form :deep(.mv-input) {
    width: 130px;
}
</style>
