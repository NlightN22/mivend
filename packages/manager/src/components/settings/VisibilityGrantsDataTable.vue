<script setup lang="ts">
import { formatDate } from '../../i18n/format';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvButton,
    MvInput,
    MvModal,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import {
    VISIBILITY_STATUSES,
    VISIBILITY_STATUS_VARIANT,
    type VisibilityGrantRow,
} from '../../api/visibilityGrants';
import { describePeriod } from '../../utils/visibilityPeriod';

const { t } = useI18n();

// Server-side paginated: grants accumulate (revoked and expired rows are kept as the history).
// Grantee is the identifying column; the search matches grantee or manager by name or email.
function statusLabel(status: string): string {
    return t(`settingsAccess.grants.status.${status}`);
}

const props = defineProps<{
    grants: VisibilityGrantRow[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    statusFilter: string;
    searchFilter: string;
    administratorId: string;
}>();
const emit = defineEmits<{
    'update:filters': [filters: { status: string; search: string }];
    'update:page': [page: number];
    'update:page-size': [size: number];
    revoke: [grant: VisibilityGrantRow, reason: string];
}>();

const ALL_COLUMNS = computed<AdvancedDataTableColumn[]>(() => [
    {
        field: 'granteeName',
        header: t('settingsAccess.grants.columns.grantee'),
        width: 200,
        required: true,
        filterConfig: { type: 'text', placeholder: t('settingsAccess.grants.filters.grantee') },
        mobile: { primary: true },
    },
    {
        field: 'createdAt',
        header: t('settingsAccess.grants.columns.created'),
        width: 130,
        filterConfig: { type: 'none' },
    },
    {
        field: 'managerName',
        header: t('settingsAccess.grants.columns.manager'),
        width: 200,
        filterConfig: { type: 'none' },
    },
    {
        field: 'period',
        header: t('settingsAccess.grants.columns.period'),
        width: 190,
        filterConfig: { type: 'none' },
    },
    {
        field: 'status',
        header: t('settingsAccess.grants.columns.status'),
        width: 120,
        filterConfig: {
            type: 'status',
            placeholder: t('settingsAccess.grants.filters.allStatuses'),
            options: VISIBILITY_STATUSES.map(value => ({
                value,
                label: statusLabel(value),
                variant: VISIBILITY_STATUS_VARIANT[value],
            })),
        },
        mobile: { badge: true },
    },
    {
        field: 'reason',
        header: t('settingsAccess.grants.columns.reason'),
        width: 240,
        filterConfig: { type: 'none' },
    },
    {
        field: 'grantedByName',
        header: t('settingsAccess.grants.columns.grantedBy'),
        width: 170,
        filterConfig: { type: 'none' },
    },
    {
        field: 'actions',
        header: '',
        width: 110,
        filterConfig: { type: 'none' },
        mobile: { hidden: false },
    },
]);

interface Filters {
    [key: string]: unknown;
    status: string;
    granteeName: string;
}
const BLANK_FILTERS: Filters = { status: '', granteeName: '' };

const { state: tableState } = useDataTableState<Filters>(
    `visibility-grants-datatable:${props.administratorId}`,
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { status: props.statusFilter, granteeName: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS.value,
        allowedFilterKeys: ['status', 'granteeName'],
        externallyOwned: { pageSize: true, filterKeys: ['status', 'granteeName'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { status: f.status, search: f.granteeName }),
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);

interface Row extends VisibilityGrantRow {
    [key: string]: unknown;
    period: string;
}
const rows = computed<Row[]>(() =>
    props.grants.map(g => ({ ...g, period: describePeriod(g.validFrom, g.validTo) })),
);

const revokeTarget = ref<Row | null>(null);
const revokeReason = ref('');
function confirmRevoke(): void {
    if (revokeTarget.value) emit('revoke', revokeTarget.value, revokeReason.value.trim());
    revokeTarget.value = null;
    revokeReason.value = '';
}
const revocable = (row: Row): boolean => row.status === 'active' || row.status === 'scheduled';
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
        :row-height-px="49"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'granteeName', placeholder: t('settingsAccess.grants.search') }"
        :empty-message="t('settingsAccess.grants.empty')"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #toolbar-end>
            <slot name="toolbar-end" />
        </template>
        <template #cell-createdAt="{ data }">
            {{ formatDate((data as Row).createdAt) }}
        </template>
        <template #cell-status="{ data }">
            <MvStatusBadge
                :variant="
                    VISIBILITY_STATUS_VARIANT[
                        (data as Row).status as keyof typeof VISIBILITY_STATUS_VARIANT
                    ] ?? 'neutral'
                "
            >
                {{ statusLabel((data as Row).status) }}
            </MvStatusBadge>
        </template>
        <template #cell-actions="{ data }">
            <MvButton
                v-if="revocable(data as Row)"
                variant="secondary"
                size="sm"
                @click="revokeTarget = data as Row"
            >
                {{ t('settingsAccess.grants.revoke') }}
            </MvButton>
        </template>
    </MvAdvancedDataTable>

    <MvModal
        v-if="revokeTarget"
        :title="t('settingsAccess.grants.revokeTitle')"
        @close="revokeTarget = null"
    >
        <p class="visibility-grants__confirm">
            {{
                t('settingsAccess.grants.revokeText', {
                    grantee: revokeTarget.granteeName,
                    manager: revokeTarget.managerName,
                })
            }}
        </p>
        <MvInput v-model="revokeReason" :placeholder="t('settingsAccess.grants.reasonOptional')" />
        <div class="visibility-grants__actions">
            <MvButton variant="secondary" @click="revokeTarget = null">{{
                t('common.cancel')
            }}</MvButton>
            <MvButton variant="danger" @click="confirmRevoke">{{
                t('settingsAccess.grants.revoke')
            }}</MvButton>
        </div>
    </MvModal>
</template>

<style scoped>
.visibility-grants__confirm {
    margin: 0 0 14px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    line-height: 1.5;
}

.visibility-grants__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
}
</style>
