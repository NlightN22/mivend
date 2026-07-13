<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MvAppTopbar, MvAppSidebar, type AppSidebarItem } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import { adminApi } from '../api/client';

const authStore = useAuthStore();
const router = useRouter();

const initials = computed(() => {
    const [first, last] = authStore.fullName.split(' ');
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
});

const approvalsBadgeCount = ref(0);

// Full menu per docs/ai/manager-portal-pages/00-shared-conventions.md — only Dashboard has a
// real page so far, the rest route to a shared "coming soon" placeholder (see router/index.ts)
// until they're built out one at a time.
const menuItems = computed<AppSidebarItem[]>(() => [
    { label: 'Dashboard', path: '/' },
    { label: 'Orders', path: '/orders' },
    { label: 'Customers', path: '/customers' },
    { label: 'Catalog', path: '/catalog' },
    { label: 'Discounts', path: '/discounts' },
    { label: 'Approvals', path: '/approvals', badgeCount: approvalsBadgeCount.value },
    { label: 'Documents', path: '/documents' },
    { label: 'Team', path: '/team' },
    { label: 'Settings', path: '/settings' },
]);

onMounted(async () => {
    try {
        const result = await adminApi<{ myApprovalRequestsSummary: { pendingCount: number } }>(
            `query { myApprovalRequestsSummary(recentLimit: 0) { pendingCount } }`,
        );
        approvalsBadgeCount.value = result.myApprovalRequestsSummary.pendingCount;
    } catch {
        approvalsBadgeCount.value = 0;
    }
});

async function handleLogout(): Promise<void> {
    await authStore.logout();
    await router.push('/login');
}
</script>

<template>
    <div class="layout">
        <MvAppTopbar
            :user-name="authStore.fullName"
            :user-role-label="authStore.roleLabel ?? authStore.roleCode"
            :user-initials="initials"
            search-placeholder="Search customers, orders, documents, products, VIN, OEM, phone…"
            @logout="handleLogout"
        >
            <template #actions>
                <RouterLink class="layout__new-order" to="/orders/new">+ New order</RouterLink>
            </template>
        </MvAppTopbar>
        <div class="layout__body">
            <MvAppSidebar :items="menuItems" section-title="Workspace" />
            <main class="layout__content">
                <RouterView />
            </main>
        </div>
    </div>
</template>

<style scoped>
.layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--el-bg-color-page, #f6f8fb);
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

.layout__new-order {
    display: inline-flex;
    align-items: center;
    height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--el-color-primary, #00b894);
    color: #fff;
    font-weight: 700;
    font-size: 13px;
    text-decoration: none;
    white-space: nowrap;
}

.layout__new-order:hover {
    filter: brightness(1.05);
}
</style>
