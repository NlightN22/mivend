<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
    MvAdvancedDataTable,
    MvButton,
    MvModal,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import {
    deactivateCounterpartyPortalUser,
    fetchCounterpartyPortalUsers,
    type CounterpartyPortalUser,
} from '../../api/counterpartyPortalAccess';

// Issue #120, Decision 5 — read-only list of Customer logins linked to this Counterparty, plus
// Deactivate (native Customer soft-delete). No create/invite UI here (Decision 4 — self-service
// sub-user creation is the counterparty's own storefront-side responsibility).
const props = defineProps<{
    counterpartyId: string;
    canManage: boolean;
}>();

const users = ref<CounterpartyPortalUser[]>([]);
const loading = ref(false);
const error = ref('');
const deactivatingId = ref<string | null>(null);
const confirmTarget = ref<CounterpartyPortalUser | null>(null);

// This tab is exempt from server-side pagination (manager-table-standard point 6) — a
// counterparty's own portal-user count is a small, structurally bounded set (client_admin/buyer/
// accountant/observer roles), not something that accumulates unboundedly like orders/invoices.
async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        users.value = await fetchCounterpartyPortalUsers(props.counterpartyId);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load portal users';
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch(() => props.counterpartyId, load);

const ROLE_LABEL: Record<string, string> = {
    client_admin: 'Client admin',
    buyer: 'Buyer',
    accountant: 'Accountant',
    observer: 'Observer',
};

const COLUMNS: AdvancedDataTableColumn[] = [
    { field: 'name', header: 'Name / Email', width: 240, sortField: 'name', filterConfig: { type: 'none' }, mobile: { primary: true } },
    { field: 'portalRole', header: 'Portal role', width: 150, sortField: 'portalRole', filterConfig: { type: 'none' } },
    // status is a binary active/inactive badge, not a column worth sorting by.
    { field: 'status', header: 'Status', width: 120, filterConfig: { type: 'none' }, mobile: { badge: true } },
    { field: 'createdAt', header: 'Created', width: 130, sortField: 'createdAt', filterConfig: { type: 'none' } },
    { field: 'actions', header: 'Actions', width: 150, filterConfig: { type: 'none' } },
];

// No real filters (exempt table, see the pagination comment above) — useDataTableState is
// still required by MvAdvancedDataTable's own props contract (tableState/defaultFilters).
const BLANK_FILTERS: Record<string, unknown> = {};
const { state: tableState } = useDataTableState(
    'customer-portal-users-datatable',
    {
        columnOrder: COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: BLANK_FILTERS,
        pageSize: 25,
    },
    { columns: COLUMNS, allowedFilterKeys: [] },
);

interface Row {
    [key: string]: unknown;
    id: string;
    name: string;
    email: string;
    portalRole: string;
    active: boolean;
    createdAt: string;
    // Real timestamp, kept alongside the locale-formatted `createdAt` display string above —
    // sorting the display string lexically would give a wrong order across month/year
    // boundaries (locale date formats aren't sortable text).
    createdAtSortKey: number;
}

const rows = computed<Row[]>(() =>
    users.value.map(u => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.emailAddress,
        portalRole: u.portalRole ? (ROLE_LABEL[u.portalRole] ?? u.portalRole) : '—',
        active: u.active,
        createdAt: new Date(u.createdAt).toLocaleDateString(),
        createdAtSortKey: new Date(u.createdAt).getTime(),
    })),
);

// This table is exempt from server-side pagination (see the comment on `load()` above) — sort
// is applied client-side over the already-fully-loaded `rows`, driven by the same tableState.sort
// MvAdvancedDataTable already tracks, rather than adding backend sort support for a bounded list
// that never needs it.
const sortedRows = computed<Row[]>(() => {
    const active = tableState.value.sort[0];
    if (!active) return rows.value;
    const { field, order } = active;
    return [...rows.value].sort((a, b) => {
        const av = field === 'createdAt' ? a.createdAtSortKey : a[field as keyof Row];
        const bv = field === 'createdAt' ? b.createdAtSortKey : b[field as keyof Row];
        if (av === bv) return 0;
        const cmp = av! < bv! ? -1 : 1;
        return order === 1 ? cmp : -cmp;
    });
});

function openConfirm(row: Row): void {
    const user = users.value.find(u => u.id === row.id);
    if (user) confirmTarget.value = user;
}

async function handleDeactivate(): Promise<void> {
    if (!confirmTarget.value) return;
    deactivatingId.value = confirmTarget.value.id;
    error.value = '';
    try {
        await deactivateCounterpartyPortalUser(confirmTarget.value.id);
        confirmTarget.value = null;
        await load();
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not deactivate this portal user';
    } finally {
        deactivatingId.value = null;
    }
}
</script>

<template>
    <div class="customer-portal-users">
        <MvAdvancedDataTable
            v-model:table-state="tableState"
            :columns="COLUMNS"
            :rows="sortedRows"
            :loading="loading"
            :total-items="rows.length"
            :page="1"
            data-key="id"
            :row-height-px="52"
            :header-height-px="52"
            :default-filters="BLANK_FILTERS"
            empty-message="No portal users yet"
        >
            <template #cell-name="{ data }">
                <div>
                    <div class="customer-portal-users__name">{{ (data as Row).name }}</div>
                    <div class="customer-portal-users__email">{{ (data as Row).email }}</div>
                </div>
            </template>
            <template #cell-status="{ data }">
                <MvStatusBadge :variant="(data as Row).active ? 'success' : 'danger'">
                    {{ (data as Row).active ? 'Active' : 'Deactivated' }}
                </MvStatusBadge>
            </template>
            <template #cell-actions="{ data }">
                <MvButton
                    v-if="canManage && (data as Row).active"
                    size="sm"
                    variant="danger"
                    :loading="deactivatingId === (data as Row).id"
                    @click="openConfirm(data as Row)"
                >
                    Deactivate
                </MvButton>
                <span v-else-if="!(data as Row).active" class="customer-portal-users__deactivated">Deactivated</span>
            </template>
        </MvAdvancedDataTable>
        <p v-if="error" class="customer-portal-users__error">{{ error }}</p>

        <MvModal v-if="confirmTarget" title="Deactivate portal user?" @close="confirmTarget = null">
            <p>
                {{ confirmTarget.firstName }} {{ confirmTarget.lastName }} will be soft-deleted and lose
                access to the portal. The record stays in history.
            </p>
            <div class="customer-portal-users__modal-actions">
                <MvButton variant="ghost" @click="confirmTarget = null">Cancel</MvButton>
                <MvButton variant="danger" :loading="deactivatingId !== null" @click="handleDeactivate">
                    Deactivate
                </MvButton>
            </div>
        </MvModal>
    </div>
</template>

<style scoped>
.customer-portal-users {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.customer-portal-users__name {
    font-weight: 600;
}

.customer-portal-users__email {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}

.customer-portal-users__deactivated {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}

.customer-portal-users__error {
    margin: 0;
    color: var(--el-color-danger, #dc2626);
    font-size: 13px;
}

.customer-portal-users__modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}
</style>
