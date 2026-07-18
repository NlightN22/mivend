<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvSelect, MvButton, MvStatusBadge } from '@mivend/ui-kit';
import {
    fetchCounterpartyTeam,
    addCounterpartyTeamMember,
    removeCounterpartyTeamMember,
    type CounterpartyTeamMember,
    type CounterpartyTeamMemberRole,
} from '../../api/counterpartyTeam';
import type { ManagerOption } from '../../api/orders';

const props = defineProps<{
    counterpartyId: string;
    ownerId: string | null;
    ownerName: string | null;
    managers: ManagerOption[];
    canManage: boolean;
}>();

const ROLE_OPTIONS: { value: CounterpartyTeamMemberRole; label: string }[] = [
    { value: 'backup', label: 'Backup' },
    { value: 'observer', label: 'Observer' },
];

const members = ref<CounterpartyTeamMember[]>([]);
const loading = ref(false);
const error = ref('');
const newAdministratorId = ref('');
const newRole = ref('backup');
const saving = ref(false);

// A team member manager options must exclude the Owner and anyone already added — an
// administrator can only hold one relationship (Owner or one team-membership row) to a given
// counterparty at a time.
const availableManagerOptions = computed(() => [
    { value: '', label: 'Select manager' },
    ...props.managers
        .filter(m => m.id !== props.ownerId && !members.value.some(tm => tm.administratorId === m.id))
        .map(m => ({ value: m.id, label: m.name })),
]);

function managerName(administratorId: string): string {
    return props.managers.find(m => m.id === administratorId)?.name ?? administratorId;
}

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        members.value = await fetchCounterpartyTeam(props.counterpartyId);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load account team';
    } finally {
        loading.value = false;
    }
}

async function handleAdd(): Promise<void> {
    if (!newAdministratorId.value) return;
    saving.value = true;
    error.value = '';
    try {
        await addCounterpartyTeamMember(
            props.counterpartyId,
            newAdministratorId.value,
            newRole.value as CounterpartyTeamMemberRole,
        );
        newAdministratorId.value = '';
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
</script>

<template>
    <div class="account-team">
        <h3 class="account-team__title">Account team</h3>
        <ul class="account-team__list">
            <li class="account-team__row">
                <span>{{ ownerName ?? 'Unassigned' }}</span>
                <MvStatusBadge variant="info">Owner</MvStatusBadge>
            </li>
            <li v-for="member in members" :key="member.id" class="account-team__row">
                <span>{{ managerName(member.administratorId) }}</span>
                <MvStatusBadge variant="neutral">
                    {{ member.role === 'backup' ? 'Backup' : 'Observer' }}
                </MvStatusBadge>
                <MvButton
                    v-if="canManage"
                    variant="danger"
                    size="sm"
                    :disabled="saving"
                    @click="handleRemove(member.administratorId)"
                >
                    Remove
                </MvButton>
            </li>
        </ul>

        <div v-if="canManage" class="account-team__add">
            <MvSelect v-model="newAdministratorId" :options="availableManagerOptions" :disabled="saving" />
            <MvSelect v-model="newRole" :options="ROLE_OPTIONS" :disabled="saving" />
            <MvButton size="sm" :disabled="!newAdministratorId || saving" @click="handleAdd">Add</MvButton>
        </div>
        <p v-if="error" class="account-team__error">{{ error }}</p>
    </div>
</template>

<style scoped>
.account-team {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
}

.account-team__title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
}

.account-team__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.account-team__row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
}

.account-team__add {
    display: flex;
    align-items: center;
    gap: 8px;
}

.account-team__error {
    margin: 0;
    color: var(--el-color-danger, #dc2626);
    font-size: 13px;
}
</style>
