<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

export interface AppMobileSheetItem {
    key: string;
    label: string;
    path: string;
    danger?: boolean;
}

const props = defineProps<{
    open: boolean;
    items: AppMobileSheetItem[];
    activePath?: string;
    userName?: string;
    userRoleLabel?: string | null;
    userInitials?: string;
}>();
const emit = defineEmits<{ close: []; logout: [] }>();

function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && props.open) emit('close');
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div v-if="open" class="mv-mobile-sheet-backdrop" @click="emit('close')" />
    <section class="mv-mobile-sheet" :class="{ 'mv-mobile-sheet--open': open }" :aria-hidden="!open">
        <div class="mv-mobile-sheet__handle" />
        <div class="mv-mobile-sheet__head">
            <h2 class="mv-mobile-sheet__title">Workspace</h2>
            <button type="button" class="mv-mobile-sheet__close" aria-label="Close menu" @click="emit('close')">×</button>
        </div>

        <div v-if="userName" class="mv-mobile-sheet__profile">
            <span class="mv-mobile-sheet__avatar">{{ userInitials }}</span>
            <div>
                <div class="mv-mobile-sheet__user-name">{{ userName }}</div>
                <div v-if="userRoleLabel" class="mv-mobile-sheet__user-role">{{ userRoleLabel }}</div>
            </div>
        </div>

        <div class="mv-mobile-sheet__grid">
            <RouterLink
                v-for="item in items"
                :key="item.key"
                class="mv-mobile-sheet__item"
                :class="{
                    'mv-mobile-sheet__item--danger': item.danger,
                    'mv-mobile-sheet__item--active': !!activePath && activePath.startsWith(item.path),
                }"
                :aria-current="activePath && activePath.startsWith(item.path) ? 'page' : undefined"
                :to="item.path"
                @click="emit('close')"
            >
                {{ item.label }}
            </RouterLink>
            <button type="button" class="mv-mobile-sheet__item mv-mobile-sheet__item--wide mv-mobile-sheet__item--danger" @click="emit('logout')">
                Log out
            </button>
        </div>
    </section>
</template>

<style scoped>
.mv-mobile-sheet-backdrop,
.mv-mobile-sheet {
    display: none;
}

@media (max-width: 800px) {
    .mv-mobile-sheet-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 58;
        background: rgba(12, 24, 36, 0.42);
    }

    .mv-mobile-sheet {
        display: block;
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 60;
        max-height: min(72vh, 620px);
        padding: 9px 14px calc(18px + env(safe-area-inset-bottom));
        background: #fff;
        border-radius: 20px 20px 0 0;
        box-shadow: 0 -16px 40px rgba(12, 24, 36, 0.22);
        transform: translateY(105%);
        transition: transform 180ms ease;
        overflow-y: auto;
    }
}

.mv-mobile-sheet--open {
    transform: translateY(0);
}

.mv-mobile-sheet__handle {
    width: 42px;
    height: 4px;
    margin: 2px auto 14px;
    border-radius: 999px;
    background: #cdd6dc;
}

.mv-mobile-sheet__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
}

.mv-mobile-sheet__title {
    margin: 0;
    font-size: 18px;
}

.mv-mobile-sheet__close {
    width: 32px;
    height: 32px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    background: #fff;
    border-radius: 8px;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
}

.mv-mobile-sheet__profile {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px;
    background: var(--el-fill-color-light, #f8fafc);
    border-radius: 12px;
    margin-bottom: 12px;
}

.mv-mobile-sheet__avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--el-text-color-primary, #17212b);
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 800;
    flex-shrink: 0;
}

.mv-mobile-sheet__user-name {
    font-size: 13px;
    font-weight: 800;
}

.mv-mobile-sheet__user-role {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}

.mv-mobile-sheet__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.mv-mobile-sheet__item {
    border: 1px solid var(--el-border-color, #e4e7ec);
    background: #fff;
    border-radius: 12px;
    padding: 14px 12px;
    color: var(--el-text-color-primary, #17212b);
    font-weight: 700;
    font-size: 13px;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
}

.mv-mobile-sheet__item--wide {
    grid-column: 1 / -1;
}

.mv-mobile-sheet__item--danger {
    color: var(--el-color-danger, #c63f4b);
}

.mv-mobile-sheet__item--active {
    border-color: var(--el-color-primary, #00b894);
    background: var(--el-color-primary-light-9, #f0fffa);
    color: var(--el-color-primary-dark-2, #008a70);
}
</style>
