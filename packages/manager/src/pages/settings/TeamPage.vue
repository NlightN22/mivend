<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { MvNotice, MvPanel, MvSelect } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import { fetchRoles, fetchTeamMembers, updateAdministratorRole, type RoleSummary, type TeamMember } from '../../api/settings';

const authStore = useAuthStore();
const members = ref<TeamMember[]>([]);
const roles = ref<RoleSummary[]>([]);
const loading = ref(true);
const error = ref('');

interface RowState {
    saving: boolean;
    error: string;
}
const rowState = reactive<Record<string, RowState>>({});

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        const [teamMembers, roleList] = await Promise.all([fetchTeamMembers(), fetchRoles()]);
        members.value = teamMembers;
        roles.value = roleList;
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load team members';
    } finally {
        loading.value = false;
    }
}

onMounted(load);

function roleIdForCode(code: string | null): string {
    return roles.value.find(r => r.code === code)?.id ?? '';
}

async function handleRoleChange(member: TeamMember, roleId: string): Promise<void> {
    rowState[member.id] = { saving: true, error: '' };
    try {
        await updateAdministratorRole(member.id, roleId);
        member.roleCode = roles.value.find(r => r.id === roleId)?.code ?? member.roleCode;
    } catch (e) {
        rowState[member.id] = {
            saving: false,
            error: e instanceof Error ? e.message : 'Could not update role',
        };
        return;
    }
    rowState[member.id] = { saving: false, error: '' };
}
</script>

<template>
    <div v-if="!authStore.hasPermission('ManageAccessControl')" class="team-page__not-authorized">
        <h1>Not authorized</h1>
        <p>You don't have permission to manage roles and access.</p>
    </div>

    <div v-else class="team-page">
        <div class="team-page__breadcrumb">Workspace / Settings</div>
        <h1 class="team-page__title">Team</h1>
        <SettingsSubNav active="team" />

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <MvPanel v-if="!loading" title="Team">
            <ul v-if="members.length" class="team-page__items">
                <li v-for="member in members" :key="member.id" class="team-page__row">
                    <div class="team-page__identity">
                        <strong>{{ member.firstName }} {{ member.lastName }}</strong>
                        <span class="team-page__email">{{ member.emailAddress }}</span>
                    </div>
                    <div class="team-page__role-control">
                        <MvSelect
                            :model-value="roleIdForCode(member.roleCode)"
                            :options="roles.map(r => ({ value: r.id, label: r.code }))"
                            :disabled="rowState[member.id]?.saving"
                            @update:model-value="handleRoleChange(member, $event)"
                        />
                        <span v-if="rowState[member.id]?.saving" class="team-page__status">Saving…</span>
                        <span v-else-if="rowState[member.id]?.error" class="team-page__status team-page__status--error">
                            {{ rowState[member.id].error }}
                        </span>
                    </div>
                </li>
            </ul>
            <p v-else-if="!error" class="team-page__email">No team members visible to your account.</p>
        </MvPanel>
    </div>
</template>

<style scoped>
.team-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 900px;
}

.team-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.team-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.team-page__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.team-page__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 12px;
}

.team-page__identity {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.team-page__email {
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.team-page__role-control {
    display: flex;
    align-items: center;
    gap: 10px;
}

.team-page__role-control :deep(.mv-select) {
    width: auto;
    min-width: 160px;
}

.team-page__status {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
    white-space: nowrap;
}

.team-page__status--error {
    color: var(--el-color-danger, #dc2626);
}

.team-page__not-authorized {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
