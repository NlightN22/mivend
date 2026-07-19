<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue';
import {
    MvButton,
    MvCheckbox,
    MvModal,
    MvSelect,
    MvStatusBadge,
    MvTable,
    MvInput,
} from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { Column } from 'element-plus';
import {
    fetchCounterpartyTeam,
    addCounterpartyTeamMember,
    removeCounterpartyTeamMember,
    type CounterpartyTeamMember,
    type CounterpartyTeamMemberRole,
} from '../../api/counterpartyTeam';
import type { ManagerOption } from '../../api/orders';
import type { EntityRef } from '../../api/history';
import EntityHistoryPanel from '../history/EntityHistoryPanel.vue';

const props = defineProps<{
    counterpartyId: string;
    ownerId: string | null;
    ownerName: string | null;
    managers: ManagerOption[];
    canManage: boolean;
    canViewHistory: boolean;
    historyRefs: EntityRef[];
}>();

const emit = defineEmits<{ loaded: [members: CounterpartyTeamMember[]] }>();

const ROLE_LABEL: Record<CounterpartyTeamMemberRole, string> = {
    backup: 'Backup manager',
    'accounting-contact': 'Accounting contact',
    observer: 'Observer',
};

const ROLE_OPTIONS: { value: CounterpartyTeamMemberRole; label: string }[] = [
    { value: 'backup', label: 'Backup manager' },
    { value: 'accounting-contact', label: 'Accounting contact' },
    { value: 'observer', label: 'Observer' },
];

// Static mock of "who gets notified" — no backend field/mutation exists yet for this, see the
// Team tab scoping decision: this panel is a visual placeholder only in this iteration.
const NOTIFICATION_ROLES = ['Primary manager', 'Backup manager', 'Accounting contact', 'Observers'] as const;
const notificationChecks = ref<Record<string, boolean>>({
    'Primary manager': true,
    'Backup manager': true,
    'Accounting contact': true,
    Observers: false,
});

const members = ref<CounterpartyTeamMember[]>([]);
const loading = ref(false);
const error = ref('');
const addOpen = ref(false);
const newAdministratorId = ref('');
const newRole = ref<CounterpartyTeamMemberRole>('backup');
const newPhone = ref('');
const saving = ref(false);

const availableManagerOptions = computed(() => [
    { value: '', label: 'Select manager' },
    ...props.managers
        .filter(m => m.id !== props.ownerId && !members.value.some(tm => tm.administratorId === m.id))
        .map(m => ({ value: m.id, label: m.name })),
]);

function manager(administratorId: string): ManagerOption | undefined {
    return props.managers.find(m => m.id === administratorId);
}

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        members.value = await fetchCounterpartyTeam(props.counterpartyId);
        emit('loaded', members.value);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load account team';
    } finally {
        loading.value = false;
    }
}

function openAdd(): void {
    newAdministratorId.value = '';
    newRole.value = 'backup';
    newPhone.value = '';
    addOpen.value = true;
}

async function handleAdd(): Promise<void> {
    if (!newAdministratorId.value) return;
    saving.value = true;
    error.value = '';
    try {
        await addCounterpartyTeamMember(
            props.counterpartyId,
            newAdministratorId.value,
            newRole.value,
            newPhone.value.trim() || null,
        );
        addOpen.value = false;
        await load();
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not add team member';
    } finally {
        saving.value = false;
    }
}

async function handleRemove(administratorId: string): Promise<void> {
    saving.value = true;
    error.value = '';
    try {
        await removeCounterpartyTeamMember(props.counterpartyId, administratorId);
        await load();
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not remove team member';
    } finally {
        saving.value = false;
    }
}

onMounted(load);
watch(() => props.counterpartyId, load);

interface TeamRow extends TableRow {
    administratorId: string | null;
    isOwner: boolean;
}

const columns = computed<Column<TableRow>[]>(() => [
    {
        key: 'member',
        title: 'Member',
        dataKey: 'member',
        width: 200,
        flexGrow: 1,
        mobile: { primary: true },
    },
    {
        key: 'role',
        title: 'Role',
        dataKey: 'role',
        width: 170,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TeamRow;
            return h(MvStatusBadge, { variant: row.isOwner ? 'info' : 'neutral' }, () => row.role as string);
        },
        mobile: { badge: true },
    },
    { key: 'primaryContact', title: 'Primary contact', dataKey: 'primaryContact', width: 130 },
    { key: 'email', title: 'Email', dataKey: 'email', width: 220 },
    { key: 'phone', title: 'Phone', dataKey: 'phone', width: 150 },
    {
        key: 'status',
        title: 'Status',
        dataKey: 'status',
        width: 110,
        cellRenderer: () => h(MvStatusBadge, { variant: 'success' }, () => 'Active'),
    },
    {
        key: 'actions',
        title: 'Actions',
        dataKey: 'actions',
        width: 110,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TeamRow;
            if (row.isOwner || !props.canManage || !row.administratorId) return h('span');
            const administratorId = row.administratorId;
            return h(
                MvButton,
                {
                    variant: 'danger',
                    size: 'sm',
                    disabled: saving.value,
                    onClick: () => void handleRemove(administratorId),
                },
                () => 'Remove',
            );
        },
    },
]);

const rows = computed<TeamRow[]>(() => {
    const ownerRow: TeamRow = {
        member: props.ownerName ?? 'Unassigned',
        role: 'Primary manager',
        primaryContact: 'Yes',
        email: manager(props.ownerId ?? '')?.email ?? '—',
        phone: '—',
        administratorId: props.ownerId,
        isOwner: true,
        _key: 'owner',
    };
    const memberRows: TeamRow[] = members.value.map(m => ({
        member: manager(m.administratorId)?.name ?? m.administratorId,
        role: ROLE_LABEL[m.role] ?? m.role,
        primaryContact: 'No',
        email: manager(m.administratorId)?.email ?? '—',
        phone: m.phone ?? '—',
        administratorId: m.administratorId,
        isOwner: false,
        _key: m.id,
    }));
    return [ownerRow, ...memberRows];
});
</script>

<template>
    <div class="customer-team">
        <div class="customer-team__header">
            <h3 class="customer-team__title">Team members <span class="customer-team__count">{{ rows.length }}</span></h3>
            <MvButton v-if="canManage" size="sm" @click="openAdd">+ Add team member</MvButton>
        </div>

        <MvTable
            :columns="columns"
            :data="rows"
            :height="Math.max(rows.length, 3) * 52 + 40"
            :loading="loading"
            empty-text="No team members yet"
        />
        <p v-if="error" class="customer-team__error">{{ error }}</p>

        <div class="customer-team__panels">
            <div class="customer-team__panel">
                <h4 class="customer-team__panel-title">Team notifications</h4>
                <p class="customer-team__panel-subtitle">
                    Choose who will receive notifications about orders, invoices and payments for this customer.
                </p>
                <div class="customer-team__notifications">
                    <MvCheckbox
                        v-for="role in NOTIFICATION_ROLES"
                        :key="role"
                        :model-value="notificationChecks[role]"
                        :label="role"
                        @update:model-value="notificationChecks[role] = $event"
                    />
                </div>
                <MvButton size="sm" disabled>Save</MvButton>
            </div>

            <div v-if="canViewHistory" class="customer-team__panel customer-team__panel--wide">
                <h4 class="customer-team__panel-title">Recent changes</h4>
                <EntityHistoryPanel :refs="historyRefs" :managers="managers" />
            </div>
        </div>

        <MvModal v-if="addOpen" title="Add team member" @close="addOpen = false">
            <div class="customer-team__form">
                <MvSelect v-model="newAdministratorId" :options="availableManagerOptions" :disabled="saving" />
                <MvSelect v-model="newRole" :options="ROLE_OPTIONS" :disabled="saving" />
                <MvInput v-model="newPhone" placeholder="Phone (optional)" :disabled="saving" />
                <MvButton :disabled="!newAdministratorId || saving" @click="handleAdd">Add member</MvButton>
            </div>
        </MvModal>
    </div>
</template>

<style scoped>
.customer-team {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.customer-team__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.customer-team__title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
}

.customer-team__count {
    color: var(--el-text-color-secondary, #6b7280);
    font-weight: 500;
}

.customer-team__error {
    margin: 0;
    color: var(--el-color-danger, #dc2626);
    font-size: 13px;
}

.customer-team__panels {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 16px;
}

@media (max-width: 800px) {
    .customer-team__panels {
        grid-template-columns: 1fr;
    }
}

.customer-team__panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-lg, 12px);
    background: #fff;
}

.customer-team__panel-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
}

.customer-team__panel-subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}

.customer-team__notifications {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.customer-team__form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
</style>
