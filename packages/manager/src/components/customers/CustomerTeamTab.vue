<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvButton,
    MvCheckbox,
    MvFormField,
    MvModal,
    MvPhoneInput,
    MvSelect,
    isValidPhone,
} from '@mivend/ui-kit';
import {
    fetchCounterpartyTeam,
    addCounterpartyTeamMember,
    removeCounterpartyTeamMember,
    type CounterpartyTeamMember,
    type CounterpartyTeamMemberRole,
} from '../../api/counterpartyTeam';
import type { ManagerOption } from '../../api/orders';
import CustomerTeamDataTable, { type TeamRow } from './CustomerTeamDataTable.vue';
import { useAuthStore } from '../../stores/auth';

// Recent-changes history for this customer is owned exclusively by the customer-detail page's
// own "History" tab (EntityHistoryPanel in CustomerDetailPage.vue) — this tab previously
// duplicated that same panel/data in a "Recent changes" side panel, showing the customer's whole
// history (not just team changes) a second time. Removed; see CustomerDetailPage.vue's `history`
// tab for the single source of truth.
const props = defineProps<{
    counterpartyId: string;
    ownerId: string | null;
    ownerName: string | null;
    managers: ManagerOption[];
    canManage: boolean;
}>();

const emit = defineEmits<{ loaded: [members: CounterpartyTeamMember[]] }>();

const authStore = useAuthStore();
const { t } = useI18n();

const ROLE_OPTIONS = computed<{ value: CounterpartyTeamMemberRole; label: string }[]>(() =>
    (['backup', 'accounting-contact', 'observer'] as const).map(role => ({
        value: role,
        label: t(`customers.team.roles.${role}`),
    })),
);

// Static mock of "who gets notified" — no backend field/mutation exists yet for this, see the
// Team tab scoping decision: this panel is a visual placeholder only in this iteration.
const NOTIFICATION_ROLES = ['primary', 'backup', 'accounting', 'observers'] as const;
const notificationChecks = ref<Record<string, boolean>>({
    primary: true,
    backup: true,
    accounting: true,
    observers: false,
});

const members = ref<CounterpartyTeamMember[]>([]);
const loading = ref(false);
const error = ref('');
const addOpen = ref(false);
const newAdministratorId = ref('');
const newRole = ref<CounterpartyTeamMemberRole>('backup');
const newPhone = ref('');
const phoneTouched = ref(false);
const phoneInvalid = computed(() => !!newPhone.value && !isValidPhone(newPhone.value));
const saving = ref(false);

const availableManagerOptions = computed(() => [
    { value: '', label: t('customers.team.selectManager') },
    ...props.managers
        .filter(
            m => m.id !== props.ownerId && !members.value.some(tm => tm.administratorId === m.id),
        )
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
        error.value = e instanceof Error ? e.message : t('customers.team.loadFailed');
    } finally {
        loading.value = false;
    }
}

function openAdd(): void {
    newAdministratorId.value = '';
    newRole.value = 'backup';
    newPhone.value = '';
    phoneTouched.value = false;
    addOpen.value = true;
}

async function handleAdd(): Promise<void> {
    phoneTouched.value = true;
    if (!newAdministratorId.value || phoneInvalid.value) return;
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
        error.value = e instanceof Error ? e.message : t('customers.team.addFailed');
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
        error.value = e instanceof Error ? e.message : t('customers.team.removeFailed');
    } finally {
        saving.value = false;
    }
}

onMounted(load);
watch(() => props.counterpartyId, load);

const rows = computed<TeamRow[]>(() => {
    const ownerRow: TeamRow = {
        id: 'owner',
        member: props.ownerName ?? t('customers.team.unassigned'),
        role: 'primary',
        isPrimary: true,
        primaryContact: t('customers.team.yes'),
        email: manager(props.ownerId ?? '')?.email ?? '—',
        phone: '—',
        createdAt: null,
        status: t('customers.team.statusActive'),
        administratorId: props.ownerId,
        isOwner: true,
    };
    const memberRows: TeamRow[] = members.value.map(m => ({
        id: m.id,
        member: manager(m.administratorId)?.name ?? m.administratorId,
        role: m.role,
        isPrimary: false,
        primaryContact: t('customers.team.no'),
        email: manager(m.administratorId)?.email ?? '—',
        phone: m.phone ?? '—',
        createdAt: m.createdAt,
        status: t('customers.team.statusActive'),
        administratorId: m.administratorId,
        isOwner: false,
    }));
    return [ownerRow, ...memberRows];
});
</script>

<template>
    <div class="customer-team">
        <CustomerTeamDataTable
            :rows="rows"
            :loading="loading"
            :can-manage="canManage"
            :saving="saving"
            :administrator-id="authStore.administrator?.id ?? 'anonymous'"
            @remove="handleRemove"
        >
            <template #toolbar-end>
                <MvButton v-if="canManage" size="sm" @click="openAdd">{{
                    t('customers.team.addMember')
                }}</MvButton>
            </template>
        </CustomerTeamDataTable>
        <p v-if="error" class="customer-team__error">{{ error }}</p>

        <div class="customer-team__panel customer-team__notifications-panel">
            <h4 class="customer-team__panel-title">{{ t('customers.team.notifications.title') }}</h4>
            <p class="customer-team__panel-subtitle">
                {{ t('customers.team.notifications.subtitle') }}
            </p>
            <div class="customer-team__notifications">
                <MvCheckbox
                    v-for="role in NOTIFICATION_ROLES"
                    :key="role"
                    :model-value="notificationChecks[role]"
                    :label="t(`customers.team.notifications.${role}`)"
                    @update:model-value="notificationChecks[role] = $event"
                />
            </div>
            <MvButton size="sm" disabled>{{ t('common.save') }}</MvButton>
        </div>

        <MvModal v-if="addOpen" :title="t('customers.team.addTitle')" @close="addOpen = false">
            <div class="customer-team__form">
                <MvSelect
                    v-model="newAdministratorId"
                    :options="availableManagerOptions"
                    :disabled="saving"
                />
                <MvSelect v-model="newRole" :options="ROLE_OPTIONS" :disabled="saving" />
                <MvFormField
                    :error="
                        phoneTouched && phoneInvalid ? t('customers.team.phoneError') : undefined
                    "
                >
                    <MvPhoneInput
                        v-model="newPhone"
                        :placeholder="t('customers.team.phonePlaceholder')"
                        :disabled="saving"
                        :error="phoneTouched && phoneInvalid"
                        @blur="phoneTouched = true"
                    />
                </MvFormField>
                <MvButton :disabled="!newAdministratorId || saving" @click="handleAdd"
                    >{{ t('customers.team.addButton') }}</MvButton
                >
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

.customer-team__error {
    margin: 0;
    color: var(--el-color-danger);
    font-size: 13px;
}

.customer-team__notifications-panel {
    max-width: 420px;
}

.customer-team__panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-lg, 12px);
    background: var(--app-surface);
}

.customer-team__panel-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
}

.customer-team__panel-subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
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
