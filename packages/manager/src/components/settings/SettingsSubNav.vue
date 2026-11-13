<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';

// Shared tab bar between the Settings sub-pages (Roles & Access, Users, Branches) — styled like
// CustomerDetailPage.vue's in-page tabs, but these are real routes (RouterLink), not
// activeTab toggles, since each section is its own page with its own data loading.
defineProps<{
    active:
        | 'roles'
        | 'users'
        | 'security'
        | 'branches'
        | 'department-branch'
        | 'visibility-grants'
        | 'unsorted'
        | 'price-type-gaps'
        | 'organizations'
        | 'category-visibility'
        | 'system-health'
        | 'check-policies';
}>();
const { t } = useI18n();
const authStore = useAuthStore();
const canManageVisibility =
    authStore.hasPermission('ManageVisibilityGrants') ||
    authStore.hasPermission('ManageAccessControl');
</script>

<template>
    <div class="settings-sub-nav">
        <RouterLink to="/settings/roles" :class="{ active: active === 'roles' }">{{
            t('settingsSystem.nav.roles')
        }}</RouterLink>
        <RouterLink to="/settings/users" :class="{ active: active === 'users' }">{{
            t('settingsSystem.nav.users')
        }}</RouterLink>
        <RouterLink to="/settings/branches" :class="{ active: active === 'branches' }">{{
            t('settingsSystem.nav.branches')
        }}</RouterLink>
        <RouterLink
            v-if="authStore.hasPermission('ManageAccessControl')"
            to="/settings/department-branch"
            :class="{ active: active === 'department-branch' }"
            >{{ t('settingsSystem.nav.departmentBranch') }}</RouterLink
        >
        <RouterLink
            v-if="canManageVisibility"
            to="/settings/visibility-grants"
            :class="{ active: active === 'visibility-grants' }"
            >{{ t('settingsSystem.nav.visibilityGrants') }}</RouterLink
        >
        <RouterLink
            v-if="canManageVisibility"
            to="/settings/unsorted"
            :class="{ active: active === 'unsorted' }"
            >{{ t('settingsSystem.nav.unsorted') }}</RouterLink
        >
        <RouterLink
            v-if="authStore.hasPermission('ReadCounterparty')"
            to="/settings/price-type-gaps"
            :class="{ active: active === 'price-type-gaps' }"
            >{{ t('settingsSystem.nav.priceTypeGaps') }}</RouterLink
        >
        <RouterLink to="/settings/organizations" :class="{ active: active === 'organizations' }">
            {{ t('settingsSystem.nav.organizations') }}
        </RouterLink>
        <RouterLink
            to="/settings/category-visibility"
            :class="{ active: active === 'category-visibility' }"
        >
            {{ t('settingsSystem.nav.categoryVisibility') }}
        </RouterLink>
        <RouterLink
            v-if="authStore.hasPermission('ManageCheckPolicies')"
            to="/settings/check-policies"
            :class="{ active: active === 'check-policies' }"
            >{{ t('settingsSystem.nav.checkPolicies') }}</RouterLink
        >
        <RouterLink to="/settings/security" :class="{ active: active === 'security' }">{{
            t('settingsSystem.nav.security')
        }}</RouterLink>
        <RouterLink to="/settings/system-health" :class="{ active: active === 'system-health' }">{{
            t('settingsSystem.nav.systemHealth')
        }}</RouterLink>
    </div>
</template>

<style scoped>
.settings-sub-nav {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--el-border-color);
    margin-top: 4px;
}

.settings-sub-nav a {
    display: inline-block;
    text-decoration: none;
    border-bottom: 2px solid transparent;
    padding: 10px 4px;
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-secondary);
}

.settings-sub-nav a.active {
    color: var(--el-color-primary-dark-2);
    border-bottom-color: var(--el-color-primary);
}
</style>
