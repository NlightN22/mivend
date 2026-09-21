<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useLatestRequest, MvButton, MvModal, MvNotice } from '@mivend/ui-kit';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import { fetchBranchOptions, type BranchOption } from '../../api/orders';
import {
    applyCounterpartyPortalAccessChanges,
    fetchActivationCandidates,
    fetchManagerLookup,
    formatManagerName,
    type ActivationCandidate,
    type ManagerLookup,
} from '../../api/counterpartyPortalAccess';
import CounterpartyActivationDataTable from '../../components/bulk-operations/CounterpartyActivationDataTable.vue';

// "Обработки" / "Активация клиентов" — issue #120. Same overall shape as
// Settings > Users (UsersPage.vue, #119's own activation page): server-paginated candidates,
// URL-synced filters, a client-side pending-change map applied as one real batch mutation on
// Save (manager-table-standard's bulk pattern + #120's own carried-over "one batch mutation, not
// N calls" decision).
const page = ref(1);
const pageSize = ref(20);
const totalItems = ref(0);
const items = ref<ActivationCandidate[]>([]);
const searchFilter = ref('');
const statusFilter = ref<'active' | 'inactive' | ''>('');

const managerLookup = ref<ManagerLookup>({ administrators: [], erpUsers: [] });
const branches = ref<BranchOption[]>([]);

function managerName(managerErpId: string | null): string {
    return formatManagerName(managerErpId, managerLookup.value);
}
function branchName(branchId: string | null): string {
    if (!branchId) return 'Unassigned';
    return branches.value.find(b => b.erpId === branchId)?.name ?? branchId;
}

const selectedIds = ref<Set<string>>(new Set());
const pendingActions = ref<Map<string, 'activate' | 'deactivate'>>(new Map());
const actionError = ref('');
const actionNotice = ref('');
const applying = ref(false);
const confirmOpen = ref(false);

interface UrlFilters {
    [key: string]: string;
    status: string;
    search: string;
    pageSize: string;
}
const URL_FILTER_DEFAULTS: UrlFilters = { status: '', search: '', pageSize: '20' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_FILTER_DEFAULTS);

{
    const parsed = { ...URL_FILTER_DEFAULTS };
    fromQuery(parsed, page);
    if (parsed.status) statusFilter.value = parsed.status as 'active' | 'inactive';
    if (parsed.search) searchFilter.value = parsed.search;
    if (parsed.pageSize) pageSize.value = Number(parsed.pageSize);
}

function buildUrlFilters(): UrlFilters {
    return { status: statusFilter.value, search: searchFilter.value, pageSize: String(pageSize.value) };
}

const { loading, run: loadCandidates } = useLatestRequest(
    () =>
        fetchActivationCandidates({
            take: pageSize.value,
            skip: (page.value - 1) * pageSize.value,
            search: searchFilter.value || undefined,
            status: statusFilter.value || undefined,
        }),
    result => {
        items.value = result.items;
        totalItems.value = result.totalItems;
    },
);

async function safeLoad(): Promise<void> {
    try {
        await loadCandidates();
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'Could not load counterparties';
    }
}

async function loadLookups(): Promise<void> {
    try {
        const [lookup, branchOptions] = await Promise.all([fetchManagerLookup(), fetchBranchOptions()]);
        managerLookup.value = lookup;
        branches.value = branchOptions;
    } catch {
        // Non-critical — manager/branch columns just fall back to raw ids/"Unassigned" if this fails.
    }
}
void loadLookups();
void safeLoad();

watch([statusFilter, searchFilter, pageSize], () => {
    page.value = 1;
});
watch([page, statusFilter, searchFilter, pageSize], () => {
    void safeLoad();
    toQuery(buildUrlFilters(), page);
});

function toggleRow(id: string): void {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
}
function selectPage(): void {
    const next = new Set(selectedIds.value);
    for (const c of items.value) {
        if (!c.isActive || c.linkedCustomerId) continue;
        if (!c.phone || !c.officialEmail) continue;
        next.add(c.id);
    }
    selectedIds.value = next;
}
function clearSelection(): void {
    selectedIds.value = new Set();
}

function queuePending(action: 'activate' | 'deactivate'): void {
    const next = new Map(pendingActions.value);
    for (const id of selectedIds.value) {
        const candidate = items.value.find(c => c.id === id);
        if (!candidate) continue;
        if (action === 'activate' && (!candidate.isActive || candidate.linkedCustomerId)) continue;
        if (action === 'deactivate' && !candidate.linkedCustomerId) continue;
        next.set(id, action);
    }
    pendingActions.value = next;
}
function clearPending(): void {
    const next = new Map(pendingActions.value);
    for (const id of selectedIds.value) next.delete(id);
    pendingActions.value = next;
}

const hasPending = computed(() => pendingActions.value.size > 0);

async function applyPending(): Promise<void> {
    applying.value = true;
    actionError.value = '';
    actionNotice.value = '';
    const changes = Array.from(pendingActions.value, ([counterpartyId, action]) => ({
        counterpartyId,
        action,
    }));
    try {
        const results = await applyCounterpartyPortalAccessChanges(changes);
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
            actionError.value = `${failures.length} counterparty(ies) failed: ${failures
                .map(f => f.error ?? f.counterpartyId)
                .join('; ')}`;
        } else {
            actionNotice.value = `Applied ${pendingActions.value.size} change(s).`;
        }
        pendingActions.value = new Map();
        selectedIds.value = new Set();
        await safeLoad();
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'Could not apply changes';
    } finally {
        applying.value = false;
        confirmOpen.value = false;
    }
}
</script>

<template>
    <div class="counterparty-activation-page">
        <h1 class="counterparty-activation-page__title">Активация клиентов</h1>
        <p class="counterparty-activation-page__subtitle">
            Filter counterparties, select rows, then choose an action. Changes stay pending until
            you Save — applied as one batch operation.
        </p>

        <MvNotice v-if="actionError" variant="error">{{ actionError }}</MvNotice>
        <MvNotice v-if="actionNotice" variant="success">{{ actionNotice }}</MvNotice>

        <CounterpartyActivationDataTable
            :items="items"
            :loading="loading"
            :total-items="totalItems"
            :page="page"
            :page-size="pageSize"
            :search-filter="searchFilter"
            :selected-ids="selectedIds"
            :pending-actions="pendingActions"
            :manager-name="managerName"
            :branch-name="branchName"
            @update:search="searchFilter = $event"
            @update:page="page = $event"
            @update:page-size="pageSize = $event"
            @toggle-row="toggleRow"
            @select-page="selectPage"
            @clear-selection="clearSelection"
        >
            <template #toolbar-end>
                <div v-if="selectedIds.size > 0" class="counterparty-activation-page__bulk-bar">
                    <span class="counterparty-activation-page__count">{{ selectedIds.size }} selected</span>
                    <MvButton size="sm" @click="queuePending('activate')">Activate portal access</MvButton>
                    <MvButton size="sm" variant="danger" @click="queuePending('deactivate')">
                        Deactivate portal access
                    </MvButton>
                    <MvButton size="sm" variant="ghost" @click="clearPending">Clear pending changes</MvButton>
                </div>
                <MvButton
                    v-if="hasPending"
                    size="sm"
                    :loading="applying"
                    @click="confirmOpen = true"
                >
                    Save changes ({{ pendingActions.size }})
                </MvButton>
            </template>
        </CounterpartyActivationDataTable>

        <MvModal v-if="confirmOpen" title="Apply changes?" @close="confirmOpen = false">
            <p>
                All pending changes will be sent as one batch mutation. Activation creates a Customer
                without a password — the counterparty sets it themselves via the email link
                (issue #121).
            </p>
            <div class="counterparty-activation-page__modal-actions">
                <MvButton variant="ghost" :disabled="applying" @click="confirmOpen = false">Cancel</MvButton>
                <MvButton :loading="applying" @click="applyPending">Apply</MvButton>
            </div>
        </MvModal>
    </div>
</template>

<style scoped>
.counterparty-activation-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.counterparty-activation-page__title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
}

.counterparty-activation-page__subtitle {
    margin: 0;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.counterparty-activation-page__bulk-bar {
    display: flex;
    align-items: center;
    gap: 8px;
}

.counterparty-activation-page__count {
    font-weight: 700;
    color: var(--el-color-primary, #0f766e);
}

.counterparty-activation-page__modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}
</style>
