<script setup lang="ts">
// Backoffice topbar shell (logo + global search placeholder + user pill with its menu) — shared
// across every manager portal page, see docs/ai/manager-portal-pages/00-shared-conventions.md.
import { ref } from 'vue';
import MvLogo from '../MvLogo/MvLogo.vue';
import MvPopover from '../MvPopover/MvPopover.vue';

withDefaults(
    defineProps<{
        userName: string;
        userRoleLabel?: string | null;
        userInitials: string;
        brandTo?: string;
        searchPlaceholder?: string;
    }>(),
    {
        brandTo: '/',
        searchPlaceholder: 'Search…',
        userRoleLabel: null,
    },
);

const menuOpen = ref(false);
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

        <MvPopover v-model:open="menuOpen" :width="260" placement="bottom-end">
            <template #trigger>
                <button
                    class="mv-app-topbar__user"
                    type="button"
                    aria-haspopup="menu"
                    :aria-label="userName"
                    :aria-expanded="menuOpen"
                >
                    <span class="mv-app-topbar__avatar">{{ userInitials }}</span>
                    <span class="mv-app-topbar__user-text">
                        {{ userName
                        }}<template v-if="userRoleLabel"> · {{ userRoleLabel }}</template>
                    </span>
                </button>
            </template>
            <div @click="menuOpen = false">
                <slot name="user-menu" />
            </div>
        </MvPopover>
    </header>
</template>

<style scoped>
.mv-app-topbar {
    display: flex;
    align-items: center;
    gap: 20px;
    height: 64px;
    padding: 0 24px;
    background: var(--app-surface);
    border-bottom: 1px solid var(--el-border-color);
    position: sticky;
    top: 0;
    z-index: var(--mv-z-sticky);
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
    color: var(--el-text-color-secondary);
}

.mv-app-topbar__search-input {
    width: 100%;
    height: 40px;
    padding: 0 70px 0 38px;
    border: 1px solid var(--el-border-color);
    border-radius: 999px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
    font-size: 14px;
    outline: none;
}

.mv-app-topbar__search-input::placeholder {
    color: var(--el-text-color-secondary);
}

.mv-app-topbar__search-shortcut {
    position: absolute;
    right: 10px;
    top: 7px;
    padding: 3px 7px;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    color: var(--el-text-color-secondary);
    background: var(--app-surface);
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
    border: 1px solid var(--el-border-color);
    border-radius: 999px;
    background: none;
    color: inherit;
    cursor: pointer;
    font-size: 13px;
}

.mv-app-topbar__user:hover {
    background: var(--el-fill-color-light);
}

.mv-app-topbar__avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--el-text-color-primary);
    color: var(--app-on-accent);
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
}

@media (max-width: 800px) {
    .mv-app-topbar {
        height: auto;
        min-height: 58px;
        padding: 8px 12px;
        gap: 8px;
    }

    .mv-app-topbar__search {
        max-width: none;
    }

    .mv-app-topbar__actions {
        display: none;
    }

    .mv-app-topbar__user {
        padding: 2px;
    }

    .mv-app-topbar__user-text {
        display: none;
    }
}
</style>
