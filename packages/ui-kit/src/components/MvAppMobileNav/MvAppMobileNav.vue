<script setup lang="ts">
import { useUiLabels } from '../../utils/uiLabels';
import { computed } from 'vue';
import { HomeFilled, User, List, CircleCheck, MoreFilled } from '@element-plus/icons-vue';
import MvCountBadge from '../MvCountBadge/MvCountBadge.vue';
const uiLabel = useUiLabels();

export interface AppMobileNavItem {
    key: string;
    label: string;
    path?: string;
    icon: 'home' | 'customers' | 'orders' | 'approvals' | 'more';
    badgeCount?: number;
}

const ICONS = {
    home: HomeFilled,
    customers: User,
    orders: List,
    approvals: CircleCheck,
    more: MoreFilled,
};

const props = defineProps<{ items: AppMobileNavItem[]; activePath: string }>();
const emit = defineEmits<{ 'select-more': [] }>();

function isActive(item: AppMobileNavItem, activePath: string): boolean {
    if (item.key === 'more') return false;
    if (item.path === '/') return activePath === '/';
    return item.path != null && activePath.startsWith(item.path);
}

// "More" groups every page that has no dedicated bottom-bar slot (Discounts/Team/Settings/
// Catalog/ProformaInvoices/Payments, per MvAppMobileMoreSheet's item list). Without this, visiting any
// of those pages leaves no tab highlighted at all — the user loses "where am I right now",
// which is the whole point of a bottom nav (Material Design: exactly one destination active).
const isMoreActive = computed(
    () => !props.items.some(item => item.key !== 'more' && isActive(item, props.activePath)),
);
</script>

<template>
    <nav
        class="mv-app-mobile-nav mv-glass-liquid"
        :aria-label="uiLabel('primaryMobileNav', 'Primary mobile navigation')"
    >
        <RouterLink
            v-for="item in items.filter(i => i.key !== 'more')"
            :key="item.key"
            class="mv-app-mobile-nav__item"
            :class="{ 'mv-app-mobile-nav__item--active': isActive(item, activePath) }"
            :to="item.path ?? '/'"
        >
            <span class="mv-app-mobile-nav__icon-wrap">
                <el-icon class="mv-app-mobile-nav__icon"
                    ><component :is="ICONS[item.icon]"
                /></el-icon>
                <MvCountBadge
                    v-if="item.badgeCount"
                    :count="item.badgeCount"
                    class="mv-app-mobile-nav__badge"
                />
            </span>
            <span class="mv-app-mobile-nav__label">{{ item.label }}</span>
        </RouterLink>

        <button
            type="button"
            class="mv-app-mobile-nav__item"
            :class="{ 'mv-app-mobile-nav__item--active': isMoreActive }"
            :aria-current="isMoreActive ? 'page' : undefined"
            @click="emit('select-more')"
        >
            <span class="mv-app-mobile-nav__icon-wrap">
                <el-icon class="mv-app-mobile-nav__icon"><MoreFilled /></el-icon>
            </span>
            <span class="mv-app-mobile-nav__label">{{ uiLabel('more', 'More') }}</span>
        </button>
    </nav>
</template>

<style scoped>
.mv-app-mobile-nav {
    display: none;
}

@media (max-width: 800px) {
    .mv-app-mobile-nav {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: var(--mv-z-floating);
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        min-height: 62px;
        padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
        border-top: 1px solid var(--el-border-color);
        box-shadow:
            inset 0 1px 0 var(--app-glass-edge),
            0 -8px 28px var(--app-ink-10);
    }
}

.mv-app-mobile-nav__item {
    display: grid;
    place-items: center;
    gap: 2px;
    border: 0;
    background: transparent;
    color: var(--app-text-body2);
    text-decoration: none;
    font-size: 10px;
    font-weight: 700;
    padding: 5px 2px;
    border-radius: 11px;
    cursor: pointer;
    min-width: 0;
}

.mv-app-mobile-nav__item--active {
    color: var(--el-color-primary-dark-2);
    background: var(--el-color-primary-light-9);
}

.mv-app-mobile-nav__icon-wrap {
    position: relative;
}

.mv-app-mobile-nav__icon {
    font-size: 20px;
}

.mv-app-mobile-nav__badge {
    position: absolute;
    top: -4px;
    right: -8px;
}

.mv-app-mobile-nav__label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
