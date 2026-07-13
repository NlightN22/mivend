<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { fetchRoles, type RoleSummary } from '../../api/settings';

const authStore = useAuthStore();
const roles = ref<RoleSummary[]>([]);
const loading = ref(true);
const error = ref('');

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        roles.value = await fetchRoles();
    } catch (e) {
        // Most common cause: the caller holds ManageAccessControl (so the nav link/page is
        // visible) but not the full permission union every seeded role requires to be visible
        // via Vendure's native `roles` query (RoleService.activeUserCanReadRole hides a Role
        // entirely from anyone who doesn't hold its full permission set) — surface the real
        // GraphQL error instead of silently rendering an empty list.
        error.value = e instanceof Error ? e.message : 'Could not load roles';
    } finally {
        loading.value = false;
    }
}

onMounted(load);
</script>

<template>
    <div v-if="!authStore.hasPermission('ManageAccessControl')" class="roles-list__not-authorized">
        <h1>Not authorized</h1>
        <p>You don't have permission to manage roles and access.</p>
    </div>

    <div v-else class="roles-list">
        <div class="roles-list__breadcrumb">Workspace / Settings</div>
        <h1 class="roles-list__title">Roles & access</h1>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <MvPanel v-if="!loading" title="Roles">
            <ul v-if="roles.length" class="roles-list__items">
                <li v-for="role in roles" :key="role.id">
                    <RouterLink :to="`/settings/roles/${role.code}`" class="roles-list__row">
                        <strong>{{ role.code }}</strong>
                        <span class="roles-list__description">{{ role.description }}</span>
                    </RouterLink>
                </li>
            </ul>
            <p v-else-if="!error" class="roles-list__description">No roles visible to your account.</p>
        </MvPanel>
    </div>
</template>

<style scoped>
.roles-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 900px;
}

.roles-list__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.roles-list__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.roles-list__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.roles-list__row {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 12px 14px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
}

.roles-list__row:hover {
    border-color: var(--el-color-primary, #00b894);
}

.roles-list__description {
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.roles-list__not-authorized {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
