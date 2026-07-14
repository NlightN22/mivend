<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge, MvButton, MvTooltip } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import { REQUEST_TYPE_LABEL } from '../../api/approvals';

// Purely presentational — row values (including reference/requestedBy/status text) are already
// resolved by buildApprovalRows() in approvalRows.ts, the single source of truth also used by
// ApprovalsInboxPage.vue for generic per-column filtering. This component only owns column
// widths/cell rendering (icons, badges, the action button) and row-click navigation.
const props = defineProps<{ rows: TableRow[] }>();
const router = useRouter();

function statusVariant(status: string): 'success' | 'danger' | 'warning' {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'danger';
    return 'warning';
}

const columns = computed<Column<TableRow>[]>(() => [
    { key: 'id', title: 'Request #', dataKey: 'id', width: 100 },
    {
        key: 'type',
        title: 'Type',
        dataKey: 'type',
        width: 200,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            return h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                REQUEST_TYPE_LABEL[row.type as string] ?? (row.type as string),
                row.escalated
                    ? h(MvTooltip, {}, {
                          default: () => `Escalated by ${row.escalatedBy as string}`,
                          trigger: () => h('span', { 'aria-label': 'Escalated' }, '⚠'),
                      })
                    : null,
            ]);
        },
    },
    { key: 'reference', title: 'Customer / Reference', dataKey: 'reference', width: 220 },
    { key: 'requestedBy', title: 'Requested by', dataKey: 'requestedBy', width: 150 },
    { key: 'currentStep', title: 'Current step', dataKey: 'currentStep', width: 200 },
    { key: 'submittedDate', title: 'Submitted', dataKey: 'submittedDate', width: 120 },
    {
        key: 'status',
        title: 'Status',
        dataKey: 'status',
        width: 120,
        cellRenderer: ({ rowData }) =>
            h(MvStatusBadge, { variant: statusVariant((rowData as TableRow).status as string) }, () =>
                (rowData as TableRow).status as string,
            ),
    },
    {
        key: 'action',
        title: '',
        dataKey: 'action',
        width: 100,
        cellRenderer: ({ rowData }) =>
            h(
                MvButton,
                {
                    size: 'sm',
                    onClick: (e: MouseEvent) => {
                        e.stopPropagation();
                        router.push(`/approvals/${(rowData as TableRow).id as string}`);
                    },
                },
                () => 'Review',
            ),
    },
]);

function openRequest(payload: { rowData: TableRow }): void {
    router.push(`/approvals/${payload.rowData.id as string}`);
}
</script>

<template>
    <MvTable
        :columns="columns"
        :data="props.rows"
        :height="Math.max(props.rows.length, 1) * 52 + 40"
        empty-text="No requests awaiting your decision"
        @row-click="openRequest"
    />
</template>
