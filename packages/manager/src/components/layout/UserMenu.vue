<script setup lang="ts">
import { computed, ref } from 'vue';
import { MvAvatar } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import UserMenuTheme from './UserMenuTheme.vue';
import { USER_MENU_ITEMS, systemSettingsPath } from './userMenuItems';

defineEmits<{ logout: [] }>();

const authStore = useAuthStore();
const settingsPath = computed(() => systemSettingsPath(authStore.hasPermission));
const email = computed(() => authStore.administrator?.emailAddress ?? null);
const menu = ref<HTMLElement | null>(null);

function onKeydown(event: KeyboardEvent): void {
    const active = document.activeElement as HTMLElement | null;
    const onRadio = active?.getAttribute('role') === 'menuitemradio';
    const step = {
        ArrowDown: 1,
        ArrowUp: -1,
        ArrowRight: onRadio ? 1 : 0,
        ArrowLeft: onRadio ? -1 : 0,
    }[event.key];
    if (!step || !menu.value) return;
    const items = [...menu.value.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
    const at = items.indexOf(active as HTMLElement);
    items[(at + step + items.length) % items.length]?.focus();
    event.preventDefault();
}
</script>

<template>
    <div ref="menu" class="user-menu" role="menu" aria-label="Account" @keydown="onKeydown">
        <div class="user-menu__identity">
            <MvAvatar :name="authStore.fullName" size="md" />
            <div class="user-menu__who">
                <div class="user-menu__name">{{ authStore.fullName }}</div>
                <div v-if="authStore.roleLabel" class="user-menu__meta">
                    {{ authStore.roleLabel }}
                </div>
                <div v-if="email" class="user-menu__meta">{{ email }}</div>
            </div>
        </div>
        <RouterLink
            v-for="item in USER_MENU_ITEMS"
            :key="item.to"
            data-popover-autofocus
            :to="item.to"
            class="user-menu__item"
            role="menuitem"
        >
            {{ item.label }}
        </RouterLink>
        <UserMenuTheme />
        <RouterLink v-if="settingsPath" :to="settingsPath" class="user-menu__item" role="menuitem">
            System settings
        </RouterLink>
        <button
            type="button"
            class="user-menu__item user-menu__item--logout"
            role="menuitem"
            @click="$emit('logout')"
        >
            Log out
        </button>
    </div>
</template>

<style scoped>
.user-menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.user-menu__identity {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 8px 12px;
    border-bottom: 1px solid var(--el-border-color);
    margin-bottom: 4px;
}

.user-menu__who {
    min-width: 0;
}

.user-menu__name {
    color: var(--el-text-color-primary);
    font-size: 15px;
    font-weight: 600;
}

.user-menu__meta {
    color: var(--app-text-grey);
    font-size: 12px;
    overflow-wrap: anywhere;
}

.user-menu__item {
    display: block;
    width: 100%;
    padding: 10px 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--app-text-body2);
    font-size: 14px;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
}

.user-menu__item--logout {
    margin-top: 4px;
    border-top: 1px solid var(--el-border-color);
    border-radius: 0 0 8px 8px;
    padding-top: 12px;
    color: var(--app-danger-fg);
}

.user-menu__item:hover,
.user-menu__item:focus-visible {
    background: var(--app-row-hover);
}

.user-menu__item--logout:hover,
.user-menu__item--logout:focus-visible {
    background: var(--app-danger-bg);
}
</style>
