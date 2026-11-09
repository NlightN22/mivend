<script setup lang="ts">
import { USER_MENU_GROUPS } from './userMenuItems';

defineEmits<{ logout: [] }>();
</script>

<template>
    <div class="user-menu">
        <div v-for="group in USER_MENU_GROUPS" :key="group.label" class="user-menu__group">
            <div class="user-menu__group-title">{{ group.label }}</div>
            <RouterLink
                v-for="item in group.items"
                :key="item.to"
                :to="item.to"
                class="user-menu__item"
                role="menuitem"
            >
                {{ item.label }}
            </RouterLink>
        </div>
        <button type="button" class="user-menu__item" role="menuitem" @click="$emit('logout')">
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

.user-menu__group-title {
    padding: 4px 8px;
    color: var(--app-text-grey);
    font-size: 12px;
}

.user-menu__item {
    display: block;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--app-text-body2);
    font-size: 14px;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
}

.user-menu__item:hover,
.user-menu__item:focus-visible {
    background: var(--app-row-hover);
}
</style>
