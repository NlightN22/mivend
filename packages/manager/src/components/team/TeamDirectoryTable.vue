<script setup lang="ts">
import { computed, h } from 'vue';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { TeamDirectoryMember, BranchOption } from '../../api/team';

const props = defineProps<{
    members: TeamDirectoryMember[];
    branches: BranchOption[];
}>();

function branchName(branchId: string | null): string {
    if (!branchId) return '—';
    return props.branches.find(b => b.erpId === branchId)?.name ?? '—';
}

const columns = computed<Column<TableRow>[]>(() => [
    { key: 'name', title: 'Name', dataKey: 'name', width: 220 },
    { key: 'position', title: 'Position', dataKey: 'position', width: 200 },
    { key: 'branch', title: 'Branch', dataKey: 'branch', width: 160 },
    {
        key: 'roles',
        title: 'Role',
        dataKey: 'roles',
        width: 220,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            const codes = row.roles as string[];
            if (!codes.length) return h('span', '—');
            return h(
                'div',
                { class: 'team-directory-table__roles' },
                codes.map(code => h(MvStatusBadge, { variant: 'info', key: code }, () => code)),
            );
        },
    },
]);

const rows = computed<TableRow[]>(() =>
    props.members.map(m => ({
        name: m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : '—',
        position: m.position ?? '—',
        branch: branchName(m.branchId),
        roles: m.roleCodes,
        _memberId: m.id,
    })),
);
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, 1) * 60 + 40"
        :row-height="60"
        empty-text="No employees in this department yet"
    />
</template>

<style scoped>
.team-directory-table__roles {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
</style>
