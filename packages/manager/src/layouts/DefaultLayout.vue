<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
    MvAppTopbar,
    MvAppSidebar,
    MvAppMobileNav,
    MvAppMobileMoreSheet,
    MvFab,
    MvScrollNav,
    MvNotice,
    type AppSidebarItem,
    type AppMobileNavItem,
    type AppMobileSheetItem,
} from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import { adminApi } from '../api/client';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const moreSheetOpen = ref(false);
// FAB only makes sense where "create a new order" is the obvious next action — the orders
// list, any order-scoped page, and a customer's Orders tab (same route, tab tracked via
// ?tab= per the manager-portal URL-sync rule, since tab switching there doesn't change path).
const onCustomerOrdersTab = computed(
    () => route.path.startsWith('/customers/') && route.query.tab === 'orders',
);
const showCreateOrderFab = computed(() => route.path.startsWith('/orders') || onCustomerOrdersTab.value);
const createOrderFabTarget = computed(() => {
    if (onCustomerOrdersTab.value) {
        const customerId = route.params.id;
        return `/orders/new?customerId=${customerId}`;
    }
    return '/orders/new';
});

const initials = computed(() => {
    const [first, last] = authStore.fullName.split(' ');
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
});

const approvalsBadgeCount = ref(0);

// Full menu per docs/ai/manager-portal-pages/00-shared-conventions.md — only Dashboard has a
// real page so far, the rest route to a shared "coming soon" placeholder (see router/index.ts)
// until they're built out one at a time.
const menuItems = computed<AppSidebarItem[]>(() => {
    const items: AppSidebarItem[] = [{ label: 'Dashboard', path: '/' }, { label: 'Orders', path: '/orders' }];
    // Gated on the same CustomPermission.ReadInvoice/ReadPayment the visibleInvoices/
    // visiblePayments queries themselves check — see AdminInvoiceVisibilityResolver/
    // AdminPaymentVisibilityResolver.
    if (authStore.hasPermission('ReadInvoice')) items.push({ label: 'Invoices', path: '/invoices' });
    if (authStore.hasPermission('ReadPayment')) items.push({ label: 'Payments', path: '/payments' });
    items.push(
        { label: 'Customers', path: '/customers' },
        { label: 'Catalog', path: '/catalog' },
        { label: 'Discounts', path: '/discounts' },
        { label: 'Approvals', path: '/approvals', badgeCount: approvalsBadgeCount.value },
        { label: 'Team', path: '/team' },
    );
    // Gated on the same ManageAccessControl permission the Settings > Roles & Access page
    // itself checks — not a role-code allowlist, so granting/revoking this via the native
    // Vendure admin UI (any role) is enough, no manager-portal code change needed.
    if (authStore.hasPermission('ManageAccessControl')) {
        items.push({ label: 'Settings', path: '/settings' });
    }
    return items;
});

// The 5 items that fit the mobile bottom bar — everything else lives in the "More" sheet.
// Computed (not a plain array) so approvalsBadgeCount's async onMounted update actually reaches
// the rendered badge — a plain array literal would freeze badgeCount at its value when this
// component's <script setup> first ran, before the fetch below ever resolves.
const mobileNavItems = computed<AppMobileNavItem[]>(() => [
    { key: 'dashboard', label: 'Dashboard', path: '/', icon: 'home' },
    { key: 'customers', label: 'Customers', path: '/customers', icon: 'customers' },
    { key: 'orders', label: 'Orders', path: '/orders', icon: 'orders' },
    {
        key: 'approvals',
        label: 'Approvals',
        path: '/approvals',
        icon: 'approvals',
        badgeCount: approvalsBadgeCount.value,
    },
    { key: 'more', label: 'More', icon: 'more' },
]);

// Same permission gates as the desktop sidebar (menuItems) — the sheet must never offer a
// route the current admin's permissions would just have the underlying query/mutation reject.
const moreSheetItems = computed<AppMobileSheetItem[]>(() => {
    const items: AppMobileSheetItem[] = [];
    if (authStore.hasPermission('ReadInvoice')) items.push({ key: 'invoices', label: 'Invoices', path: '/invoices' });
    if (authStore.hasPermission('ReadPayment')) items.push({ key: 'payments', label: 'Payments', path: '/payments' });
    items.push(
        { key: 'catalog', label: 'Catalog', path: '/catalog' },
        { key: 'discounts', label: 'Discounts', path: '/discounts' },
        { key: 'team', label: 'Team', path: '/team' },
    );
    if (authStore.hasPermission('ManageAccessControl')) {
        items.push({ key: 'settings', label: 'Settings', path: '/settings' });
    }
    return items;
});

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
                <MvNotice v-if="authStore.isReconnecting" variant="warning" class="layout__reconnecting">
                    Reconnecting to the server… your session is still active.
                </MvNotice>
                <RouterView />
            </main>
        </div>

        <MvAppMobileNav :items="mobileNavItems" :active-path="route.path" @select-more="moreSheetOpen = true" />
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
        <MvFab v-if="showCreateOrderFab" :to="createOrderFabTarget" aria-label="Create order" />
        <MvScrollNav />
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

.layout__reconnecting {
    margin-bottom: 16px;
}

@media (max-width: 800px) {
    .layout__content {
        padding: 12px;
        padding-bottom: calc(74px + env(safe-area-inset-bottom));
    }
}
</style>
