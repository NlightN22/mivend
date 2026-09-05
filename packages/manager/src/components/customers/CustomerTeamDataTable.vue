<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
    MvButton,
    MvStatusBadge,
    MvAdvancedDataTable,
    MvDateTimeCell,
    useDataTableState,
    type AdvancedDataTableColumn,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';

// Sixth consumer of @mivend/ui-kit's MvAdvancedDataTable — see manager-table-standard skill.
// Unlike every other customer-detail table, a counterparty's team is a genuinely bounded list
// (Owner + a handful of backup/observer members, see CounterpartyTeamFieldResolver's own doc
// comment on `teamMembers` — the same backend-plugin-rules skill "Pagination" exemption as a customer's own trading
// points) — there is no backend list query to page/filter against, `rows` already holds every
// row. Filtering and pagination below are therefore done entirely client-side against the full
// `rows` prop, not a stand-in for real server support that's missing — this is the deliberate
// exempt shape, still using the real MvAdvancedDataTable machinery for layout/mobile-card-view
// consistency (point 6 of the skill).
export interface TeamRow {
    [key: string]: unknown;
    id: string;
    member: string;
    role: string;
    isPrimary: boolean;
    primaryContact: string;
    email: string;
    phone: string;
    createdAt: string | null;
    status: string;
    administratorId: string | null;
    isOwner: boolean;
}

const props = defineProps<{
    rows: TeamRow[];
    loading: boolean;
    canManage: boolean;
    saving: boolean;
    administratorId: string;
}>();

const emit = defineEmits<{ remove: [administratorId: string] }>();

// Single source of truth for the Role column's badge color, reused by both the row cell and the
// column's own status-filter checklist (manager-table-standard skill point 4/4a) — never a
// bespoke per-cell color choice.
const ROLE_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    'Primary manager': 'info',
    'Backup manager': 'neutral',
    'Accounting contact': 'neutral',
    Observer: 'neutral',
};
const ROLE_OPTIONS = Object.keys(ROLE_BADGE_VARIANT).map(label => ({
    value: label,
    label,
    variant: ROLE_BADGE_VARIANT[label],
}));

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'member',
        header: 'Member',
        width: 200,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Member name contains…' },
        mobile: { primary: true },
    },
    // The Owner row is synthetic (assembled from Counterparty.assignedManagerId, not a real
    // CounterpartyTeamMember row) and has no creation timestamp of its own — rendered as a dash.
    { field: 'createdAt', header: 'Date added', width: 140, filterConfig: { type: 'none' } },
    {
        field: 'role',
        header: 'Role',
        width: 170,
        filterConfig: { type: 'status', placeholder: 'All roles', options: ROLE_OPTIONS },
        mobile: { badge: true },
    },
    { field: 'primaryContact', header: 'Primary contact', width: 130, filterConfig: { type: 'none' } },
    { field: 'email', header: 'Email', width: 220, filterConfig: { type: 'none' } },
    { field: 'phone', header: 'Phone', width: 150, filterConfig: { type: 'none' }, mobile: { hidden: true } },
    // Always "Active" today — no real per-row lifecycle exists yet for a team membership, so a
    // filter here would have exactly one value and mislead the user into thinking it does
    // something. Revisit once team membership has a real status (AGENTS.md's "What not to do" — no hardcoded enums).
    { field: 'status', header: 'Status', width: 110, filterConfig: { type: 'none' }, mobile: { hidden: true } },
    { field: 'actions', header: 'Actions', width: 110, filterConfig: { type: 'none' } },
];

interface TeamFilterState {
    [key: string]: unknown;
    role: string;
    member: string;
}
const BLANK_FILTERS: TeamFilterState = { role: '', member: '' };

const { state: tableState } = useDataTableState<TeamFilterState>(
    `customer-team-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: BLANK_FILTERS,
        pageSize: 20,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => c.field),
    },
);

// No backend fetch to trigger — filtering/paging happens entirely below against `props.rows`.
// Any filter change still resets to page 1, same invariant as every other table (see
// MvAdvancedDataTable's own doc comment on this).
// Local page cursor — kept out of tableState (which is persisted to localStorage) since a
// stale saved page number for a list this small is never useful across sessions.
const page = ref(1);
watch(
    () => tableState.value.filters,
    () => {
        page.value = 1;
    },
    { deep: true },
);

const filteredRows = computed(() =>
    props.rows.filter(row => {
        const memberQuery = (tableState.value.filters.member as string).trim().toLowerCase();
        if (memberQuery && !row.member.toLowerCase().includes(memberQuery)) return false;
        const roleFilter = tableState.value.filters.role as string;
        if (roleFilter && row.role !== roleFilter) return false;
        return true;
    }),
);

const pagedRows = computed(() => {
    const start = (page.value - 1) * tableState.value.pageSize;
    return filteredRows.value.slice(start, start + tableState.value.pageSize);
});
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="ALL_COLUMNS"
        :rows="pagedRows"
        :loading="loading"
        :total-items="filteredRows.length"
        :page="page"
        data-key="id"
        :row-height-px="49"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'member', placeholder: 'Search team members…' }"
        empty-message="No team members yet"
        @update:page="p => (page = p)"
        @reset-page="page = 1"
    >
        <template #toolbar-end>
            <slot name="toolbar-end" />
        </template>

        <template #cell-createdAt="{ data }">
            <MvDateTimeCell v-if="(data as TeamRow).createdAt" :value="(data as TeamRow).createdAt as string" />
            <span v-else>—</span>
        </template>
        <template #cell-role="{ data }">
            <MvStatusBadge :variant="ROLE_BADGE_VARIANT[(data as TeamRow).role] ?? 'neutral'">{{ (data as TeamRow).role }}</MvStatusBadge>
        </template>
        <template #cell-status="{ data }">
            <MvStatusBadge variant="success">{{ (data as TeamRow).status }}</MvStatusBadge>
        </template>
        <template #cell-actions="{ data }">
            <MvButton
                v-if="!(data as TeamRow).isOwner && canManage && (data as TeamRow).administratorId"
                variant="danger"
                size="sm"
                :disabled="saving"
                @click="emit('remove', (data as TeamRow).administratorId as string)"
            >
                Remove
            </MvButton>
        </template>
    </MvAdvancedDataTable>
</template>
