import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

export const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/login',
            component: () => import('../pages/auth/LoginPage.vue'),
            meta: { layout: 'auth' },
        },
        {
            // Reached from the emailed reset link with no session yet, so this route must sit outside DefaultLayout, like /login
            path: '/set-password',
            component: () => import('../pages/auth/SetPasswordPage.vue'),
            meta: { layout: 'auth' },
        },
        {
            path: '/',
            component: () => import('../layouts/DefaultLayout.vue'),
            children: [
                {
                    path: '',
                    name: 'dashboard',
                    component: () => import('../pages/dashboard/DashboardPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'orders',
                    name: 'orders',
                    component: () => import('../pages/orders/OrdersPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'orders/new',
                    name: 'orders-new',
                    component: () => import('../pages/orders/OrderCreatePage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'orders/:code',
                    name: 'order-detail',
                    component: () => import('../pages/orders/OrderDetailPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'proforma-invoices',
                    name: 'proformaInvoices',
                    component: () => import('../pages/proforma-invoices/ProformaInvoicesPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'payments',
                    name: 'payments',
                    component: () => import('../pages/payments/PaymentsPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'approvals',
                    name: 'approvals',
                    component: () => import('../pages/approvals/ApprovalsInboxPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'approvals/:id',
                    name: 'approval-detail',
                    component: () => import('../pages/approvals/ApprovalDetailPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'customers',
                    name: 'customers',
                    component: () => import('../pages/customers/CustomersPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'customers/:id',
                    name: 'customer-detail',
                    component: () => import('../pages/customers/CustomerDetailPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'discounts',
                    name: 'discounts',
                    component: () => import('../pages/discounts/DiscountsPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'catalog',
                    name: 'catalog',
                    component: () => import('../pages/catalog/CatalogPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'catalog/:slug',
                    name: 'catalog-detail',
                    component: () => import('../pages/catalog/ProductDetailPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'notifications',
                    name: 'notifications',
                    component: () => import('../pages/notifications/NotificationsPage.vue'),
                    meta: { requiresAuth: true, title: 'Notifications' },
                },
                {
                    path: 'settings',
                    redirect: '/settings/roles',
                },
                {
                    path: 'settings/roles',
                    name: 'settings-roles',
                    component: () => import('../pages/settings/RolesListPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/roles/:code',
                    name: 'settings-role-detail',
                    component: () => import('../pages/settings/RoleDetailPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/users',
                    name: 'settings-users',
                    component: () => import('../pages/settings/UsersPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/branches',
                    name: 'settings-branches',
                    component: () => import('../pages/settings/BranchSettingsPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/department-branch',
                    name: 'settings-department-branch',
                    component: () => import('../pages/settings/DepartmentBranchPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/visibility-grants',
                    name: 'settings-visibility-grants',
                    component: () => import('../pages/settings/VisibilityGrantsPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/unsorted',
                    name: 'settings-unsorted',
                    component: () => import('../pages/settings/UnsortedPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/organizations',
                    name: 'settings-organizations',
                    component: () => import('../pages/settings/OrganizationsPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/category-visibility',
                    name: 'settings-category-visibility',
                    component: () => import('../pages/settings/CategoryVisibilityPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/security',
                    name: 'settings-security',
                    component: () => import('../pages/settings/SecurityPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/system-health',
                    name: 'settings-system-health',
                    component: () => import('../pages/settings/SystemHealthPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/check-policies',
                    name: 'settings-check-policies',
                    component: () => import('../pages/settings/CheckPoliciesPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'team',
                    name: 'team',
                    component: () => import('../pages/team/TeamPage.vue'),
                    meta: { requiresAuth: true, title: 'Team' },
                },
                {
                    // Intentionally a thin shell: a generic bulk-operations framework is deferred until more tabs need it.
                    path: 'bulk-operations/counterparty-activation',
                    name: 'bulk-operations-counterparty-activation',
                    component: () =>
                        import('../pages/bulk-operations/CounterpartyActivationPage.vue'),
                    meta: { requiresAuth: true, title: 'Активация клиентов' },
                },
                ...[
                    { path: 'customers/new', title: 'New client' },
                    { path: 'profile', title: 'Profile' },
                ].map(({ path, title }) => ({
                    path,
                    component: () => import('../pages/error/ComingSoonPage.vue'),
                    meta: { requiresAuth: true, title },
                })),
                {
                    path: ':pathMatch(.*)*',
                    component: () => import('../pages/error/NotFoundPage.vue'),
                },
            ],
        },
    ],
});

router.beforeEach(async (to, _from, next) => {
    const authStore = useAuthStore();
    await authStore.init();
    // Only a confirmed 'unauthenticated' redirects to /login; 'unknown' (checking, or network retries
    // exhausted) proceeds so a prolonged outage never bounces a valid session to login.
    if (to.meta.requiresAuth && authStore.authStatus === 'unauthenticated') {
        next({ path: '/login', query: { redirect: to.fullPath } });
    } else {
        next();
    }
});
