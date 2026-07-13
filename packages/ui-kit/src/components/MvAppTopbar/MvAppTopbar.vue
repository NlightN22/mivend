<script setup lang="ts">
// Backoffice topbar shell (logo + global search placeholder + user pill + logout) — shared
// across every manager portal page, see docs/ai/manager-portal-pages/00-shared-conventions.md.
import MvLogo from '../MvLogo/MvLogo.vue';

withDefaults(
    defineProps<{
        userName: string;
        userRoleLabel?: string | null;
        userInitials: string;
        brandTo?: string;
        profileTo?: string;
        searchPlaceholder?: string;
    }>(),
    {
        brandTo: '/',
        profileTo: '/profile',
        searchPlaceholder: 'Search…',
        userRoleLabel: null,
    },
);

const emit = defineEmits<{ logout: [] }>();
</script>

<template>
    <header class="mv-app-topbar">
        <RouterLink class="mv-app-topbar__brand" :to="brandTo">
            <MvLogo size="sm" />
        </RouterLink>

        <div class="mv-app-topbar__search">
            <span class="mv-app-topbar__search-icon">⌕</span>
            <input
                class="mv-app-topbar__search-input"
                type="search"
                :placeholder="searchPlaceholder"
                disabled
            />
            <span class="mv-app-topbar__search-shortcut">Ctrl K</span>
        </div>

        <div class="mv-app-topbar__actions">
            <slot name="actions" />
        </div>

        <RouterLink class="mv-app-topbar__user" :to="profileTo">
            <span class="mv-app-topbar__avatar">{{ userInitials }}</span>
            <span class="mv-app-topbar__user-text">
                {{ userName }}<template v-if="userRoleLabel"> · {{ userRoleLabel }}</template>
            </span>
        </RouterLink>
        <button class="mv-app-topbar__logout" type="button" @click="emit('logout')">Log out</button>
    </header>
</template>

<style scoped>
.mv-app-topbar {
    display: flex;
    align-items: center;
    gap: 20px;
    height: 64px;
    padding: 0 24px;
    background: var(--app-surface, #fff);
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    position: sticky;
    top: 0;
    z-index: 20;
}

.mv-app-topbar__brand {
    display: flex;
    align-items: center;
    color: inherit;
    text-decoration: none;
}

.mv-app-topbar__search {
    flex: 1;
    max-width: 640px;
    position: relative;
}

.mv-app-topbar__search-icon {
    position: absolute;
    top: 10px;
    left: 14px;
    color: var(--el-text-color-secondary, #9ca3af);
}

.mv-app-topbar__search-input {
    width: 100%;
    height: 40px;
    padding: 0 70px 0 38px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 999px;
    background: var(--el-fill-color-light, #f8fafc);
    color: var(--el-text-color-primary, #17212b);
    font-size: 14px;
    outline: none;
}

.mv-app-topbar__search-input::placeholder {
    color: var(--el-text-color-secondary, #9ca3af);
}

.mv-app-topbar__search-shortcut {
    position: absolute;
    right: 10px;
    top: 7px;
    padding: 3px 7px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 8px;
    color: var(--el-text-color-secondary, #6b7280);
    background: #fff;
    font-size: 12px;
}

.mv-app-topbar__actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
}

.mv-app-topbar__user {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 999px;
    color: inherit;
    text-decoration: none;
    font-size: 13px;
}

.mv-app-topbar__user:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.mv-app-topbar__avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--el-text-color-primary, #17212b);
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
}

.mv-app-topbar__logout {
    background: none;
    border: 1px solid var(--el-border-color, #e4e7ec);
    color: var(--el-text-color-primary, #17212b);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
}

.mv-app-topbar__logout:hover {
    background: var(--el-fill-color-light, #f8fafc);
}
</style>
