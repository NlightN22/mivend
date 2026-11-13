<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvButton,
    MvDateTimeCell,
    MvErrorState,
    MvModal,
    MvStatusBadge,
} from '@mivend/ui-kit';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import {
    deactivateCounterpartyPortalUser,
    fetchCounterpartyPortalUsers,
    type CounterpartyPortalUser,
} from '../../api/counterpartyPortalAccess';
import { useAuthStore } from '../../stores/auth';
import { useCardTabList } from '../../composables/useCardTabList';
import { useCardTabTable } from '../../composables/useCardTabTable';
import {
    PORTAL_USER_SORT_FIELDS,
    PORTAL_USER_DEFAULT_SORT,
    buildPortalUserColumns,
} from './portalUsersColumns';
import {
    PORTAL_USER_STATUSES,
    filterPortalUsers,
    sortPortalUsers,
    type PortalUserRow,
} from '../../utils/portalUsersList';
import TableViewsMenu from '../TableViewsMenu.vue';

// Read-only list of the customer logins linked to this Counterparty, plus Deactivate (native Customer
// soft-delete). Exempt from server-side paging, search and filters: it is one customer's own portal
// logins, a small set bounded by the four portal roles, so all of it loads once and is narrowed here.
// Shown only to ManageCounterpartyPortalAccess (the tab itself is hidden otherwise).
const props = defineProps<{
    counterpartyId: string;
    canManage: boolean;
    urlPrefix?: string;
}>();

const { t, te } = useI18n();
const authStore = useAuthStore();
const prefix = props.urlPrefix ?? 'portalUsers.';
const users = ref<CounterpartyPortalUser[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const error = ref('');
const deactivatingId = ref<string | null>(null);
const confirmTarget = ref<CounterpartyPortalUser | null>(null);

async function load(): Promise<void> {
    loading.value = true;
    loadFailed.value = false;
    try {
        users.value = await fetchCounterpartyPortalUsers(props.counterpartyId);
    } catch (e) {
        loadFailed.value = true;
        console.warn('[portal users] could not load the list:', e);
    } finally {
        loading.value = false;
    }
}
onMounted(load);
watch(() => props.counterpartyId, load);

const roleLabel = (role: string): string =>
    te(`customers.portalUsers.roles.${role}`) ? t(`customers.portalUsers.roles.${role}`) : role;

const columns = computed(() =>
    buildPortalUserColumns({
        roles: [...new Set(users.value.map(u => u.portalRole).filter((r): r is string => !!r))].map(
            value => ({ value, label: roleLabel(value) }),
        ),
        statuses: PORTAL_USER_STATUSES.map(value => ({
            value,
            label: t(`customers.portalUsers.${value}`),
        })),
    }),
);
const baseColumns = buildPortalUserColumns({ roles: [], statuses: [] });

const list = useCardTabList({
    urlPrefix: prefix,
    filterColumns: toFilterColumns(baseColumns),
    sortFields: PORTAL_USER_SORT_FIELDS,
    defaultSort: PORTAL_USER_DEFAULT_SORT,
    onChange: () => undefined,
});
const ownerKey = authStore.administrator?.id ?? 'anonymous';
const { tableState, captureView, applyView, openedWithLink } = useCardTabTable({
    storageKey: `customer-portal-users-v1:${ownerKey}`,
    columns: baseColumns,
    list,
    urlPrefix: prefix,
    defaultSort: PORTAL_USER_DEFAULT_SORT,
});

const allRows = computed<PortalUserRow[]>(() =>
    users.value.map(u => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.emailAddress,
        portalRole: u.portalRole,
        active: u.active,
        createdAt: u.createdAt,
    })),
);
const matching = computed(() =>
    sortPortalUsers(
        filterPortalUsers(allRows.value, list.search.value, list.conditions.value),
        list.sort.value,
    ),
);
const rows = computed(() => {
    const start = (list.page.value - 1) * list.pageSize.value;
    return matching.value.slice(start, start + list.pageSize.value);
});
type Row = PortalUserRow;

function clearFilters(): void {
    list.search.value = '';
    list.conditions.value = [];
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
        error.value = e instanceof Error ? e.message : t('customers.portalUsers.deactivateFailed');
    } finally {
        deactivatingId.value = null;
    }
}
</script>

<template>
    <div class="customer-portal-users">
        <MvAdvancedDataTable
            v-model:table-state="tableState"
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :total-items="matching.length"
            :page="list.page.value"
            data-key="id"
            :row-height-px="52"
            :header-height-px="65"
            :search="{
                filterKey: 'search',
                placeholder: t('customers.portalUsers.searchPlaceholder'),
            }"
            :conditions="list.conditions.value"
            :default-filters="{ search: '' }"
            :empty-message="t('customers.portalUsers.empty')"
            @update:conditions="list.conditions.value = $event"
            @update:page="list.page.value = $event"
            @reset-page="list.page.value = 1"
            @clear-filters="clearFilters"
        >
            <template #empty>
                <MvErrorState
                    v-if="loadFailed"
                    :title="t('customers.portalUsers.loadFailed')"
                    :message="t('customers.portalUsers.loadFailedMessage')"
                    @retry="load"
                />
                <template v-else>{{
                    loading
                        ? ''
                        : allRows.length
                          ? t('customers.portalUsers.noMatch')
                          : t('customers.portalUsers.empty')
                }}</template>
            </template>

            <template #toolbar-end>
                <TableViewsMenu
                    views-key="customer-portal-users"
                    :owner-key="ownerKey"
                    :capture="captureView"
                    :apply="applyView"
                    :skip-restore="() => openedWithLink"
                />
            </template>

            <template #cell-name="{ data }">
                <div>
                    <div class="customer-portal-users__name">{{ (data as Row).name }}</div>
                    <div class="customer-portal-users__email">{{ (data as Row).email }}</div>
                </div>
            </template>
            <template #cell-createdAt="{ data }">
                <MvDateTimeCell :value="(data as Row).createdAt" />
            </template>
            <template #cell-portalRole="{ data }">
                {{ (data as Row).portalRole ? roleLabel((data as Row).portalRole!) : '—' }}
            </template>
            <template #cell-status="{ data }">
                <MvStatusBadge :variant="(data as Row).active ? 'success' : 'danger'">
                    {{
                        (data as Row).active
                            ? t('customers.portalUsers.active')
                            : t('customers.portalUsers.deactivated')
                    }}
                </MvStatusBadge>
            </template>
            <template #cell-actions="{ data }">
                <MvButton
                    v-if="canManage && (data as Row).active"
                    size="sm"
                    variant="danger"
                    :loading="deactivatingId === (data as Row).id"
                    @click="confirmTarget = users.find(u => u.id === (data as Row).id) ?? null"
                >
                    {{ t('customers.portalUsers.deactivate') }}
                </MvButton>
            </template>
        </MvAdvancedDataTable>
        <p v-if="error" class="customer-portal-users__error">{{ error }}</p>

        <MvModal
            v-if="confirmTarget"
            :title="t('customers.portalUsers.confirmTitle')"
            @close="confirmTarget = null"
        >
            <p>
                {{
                    t('customers.portalUsers.confirmText', {
                        name: `${confirmTarget.firstName} ${confirmTarget.lastName}`,
                    })
                }}
            </p>
            <div class="customer-portal-users__modal-actions">
                <MvButton variant="ghost" @click="confirmTarget = null">{{
                    t('common.cancel')
                }}</MvButton>
                <MvButton
                    variant="danger"
                    :loading="deactivatingId !== null"
                    @click="handleDeactivate"
                >
                    {{ t('customers.portalUsers.deactivate') }}
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
    color: var(--el-text-color-secondary);
}

.customer-portal-users__error {
    margin: 0;
    color: var(--el-color-danger);
    font-size: 13px;
}

.customer-portal-users__modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}
</style>
