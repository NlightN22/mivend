<script setup lang="ts">
// Shared tab bar between the Settings sub-pages (Roles & Access, Team) — styled like
// CustomerDetailPage.vue's in-page tabs, but these are real routes (RouterLink), not
// activeTab toggles, since each section is its own page with its own data loading.
defineProps<{ active: 'roles' | 'team' | 'security' }>();
</script>

<template>
    <div class="settings-sub-nav">
        <RouterLink to="/settings/roles" :class="{ active: active === 'roles' }">Roles & access</RouterLink>
        <RouterLink to="/settings/team" :class="{ active: active === 'team' }">Team</RouterLink>
        <RouterLink to="/settings/security" :class="{ active: active === 'security' }">Security</RouterLink>
    </div>
</template>

<style scoped>
.settings-sub-nav {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    margin-top: 4px;
}

.settings-sub-nav a {
    display: inline-block;
    text-decoration: none;
    border-bottom: 2px solid transparent;
    padding: 10px 4px;
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-secondary, #6b7280);
}

.settings-sub-nav a.active {
    color: var(--el-color-primary-dark-2, #008a70);
    border-bottom-color: var(--el-color-primary, #00b894);
}
</style>
