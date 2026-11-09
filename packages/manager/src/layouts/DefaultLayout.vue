<script setup lang="ts">
import UserMenu from '../components/layout/UserMenu.vue';
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import {
    MvAppTopbar,
    MvAppSidebar,
    MvAppMobileNav,
    MvAppMobileMoreSheet,
    MvScrollNav,
    MvConnectionBar,
    MvNotice,
    MvNotificationBell,
    MvNotificationPanel,
} from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import { fetchPendingApprovalsBadgeCount } from '../api/approvals';
import { useNavItems } from '../composables/useNavItems';
import { useNotificationsStore } from '../stores/notifications';

const notificationsStore = useNotificationsStore();
const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
} = storeToRefs(notificationsStore);
const { markRead, resolve } = notificationsStore;
const notificationPanelOpen = ref(false);

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const moreSheetOpen = ref(false);
const initials = computed(() => {
    const [first, last] = authStore.fullName.split(' ');
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
});

const approvalsBadgeCount = ref(0);

const { menuItems, mobileNavItems, moreSheetItems } = useNavItems(approvalsBadgeCount);

onMounted(async () => {
    try {
        approvalsBadgeCount.value = await fetchPendingApprovalsBadgeCount();
    } catch {
        approvalsBadgeCount.value = 0;
    }
});

async function handleLogout(): Promise<void> {
    const providerUrl = await authStore.logout(true);
    if (providerUrl) {
        window.location.href = providerUrl;
        return;
    }
    await router.push('/login');
}

// Deliberately a hard browser navigation, not router.push — this fires from the connection bar
// after a long, still-unresolved outage (MvConnectionBar's own escalation timer), so the backend
// call inside authStore.logout() may itself be unreachable/hanging. A full navigation resets
// every in-memory bit of stuck state (the background-retry timer/generation included) instead of
// depending on that call to ever resolve — same "just restart" fix the user actually wants here.
function handleRelogin(): void {
    void authStore.logout();
    window.location.href = '/login';
}
</script>

<template>
    <div class="layout">
        <!-- Fixed to the viewport (not inside .layout__content, unlike the old static notice)
             so a background reconnect stays visible regardless of scroll position or which page
             is open — see stores/auth.ts's isReconnecting for when this actually fires (only
             after adminApi's own bounded retry is exhausted, so this never flashes for a single
             blip). -->
        <MvConnectionBar
            v-if="authStore.isReconnecting"
            :since="authStore.reconnectingSince"
            @relogin="handleRelogin"
        />
        <!-- Server is reachable but the session itself is confirmed dead (e.g. a stale session
             cache after a server restart) — never auto-navigates away from whatever the user is
             doing; they click "Log in again" on their own terms, same as the outage bar above. -->
        <MvConnectionBar
            v-else-if="authStore.authStatus === 'unauthenticated' && authStore.initialized"
            :since="null"
            logged-out
            @relogin="handleRelogin"
        />
        <MvAppTopbar
            :user-name="authStore.fullName"
            :user-role-label="authStore.roleLabel ?? authStore.roleCode"
            :user-initials="initials"
            search-placeholder="Search customers, orders, documents, products, VIN, OEM, phone…"
            @logout="handleLogout"
        >
            <template #actions>
                <MvNotificationBell
                    :unread-count="unreadCount"
                    @click="notificationPanelOpen = !notificationPanelOpen"
                />
            </template>
            <template #user-menu>
                <UserMenu @logout="handleLogout" />
            </template>
        </MvAppTopbar>
        <div v-if="notificationPanelOpen" class="layout__notification-panel">
            <MvNotificationPanel
                :notifications="notifications"
                :loading="notificationsLoading"
                @mark-read="markRead"
                @resolve="resolve"
                @close="notificationPanelOpen = false"
                @view-all="
                    notificationPanelOpen = false;
                    router.push('/notifications');
                "
            />
        </div>
        <div class="layout__body">
            <MvAppSidebar :items="menuItems" section-title="Workspace" />
            <main class="layout__content">
                <MvNotice
                    v-if="authStore.isDefaultSuperadminAccount"
                    variant="warning"
                    class="layout__default-account"
                >
                    You're signed in with the default <strong>superadmin</strong> account and its
                    default password.
                    <RouterLink to="/settings/security">Change the password</RouterLink>
                </MvNotice>
                <RouterView />
            </main>
        </div>

        <MvAppMobileNav
            :items="mobileNavItems"
            :active-path="route.path"
            @select-more="moreSheetOpen = true"
        />
        <MvAppMobileMoreSheet
            :open="moreSheetOpen"
            :items="moreSheetItems"
            :active-path="route.path"
            :user-name="authStore.fullName"
            :user-role-label="authStore.roleLabel ?? authStore.roleCode"
            :user-initials="initials"
            @close="moreSheetOpen = false"
            @logout="handleLogout"
        />
        <MvScrollNav />
    </div>
</template>

<style scoped>
.layout {
    --mv-scroll-nav-offset: 25vh;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--el-bg-color-page);
}

.layout__notification-panel {
    position: fixed;
    top: 64px;
    right: 24px;
    z-index: var(--mv-z-overlay);
    width: 360px;
    max-width: calc(100vw - 32px);
}

.layout__body {
    display: flex;
    flex: 1;
}

.layout__content {
    flex: 1;
    padding: 24px;
    min-width: 0;
}

.layout__default-account {
    margin-bottom: 16px;
}

.layout__default-account a {
    margin-left: 6px;
    font-weight: 600;
    color: inherit;
    text-decoration: underline;
}

@media (max-width: 800px) {
    .layout__content {
        padding: 12px;
        padding-bottom: calc(74px + env(safe-area-inset-bottom));
    }
}
</style>
