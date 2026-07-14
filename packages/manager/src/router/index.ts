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
                    path: 'settings/team',
                    name: 'settings-team',
                    component: () => import('../pages/settings/TeamPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'settings/security',
                    name: 'settings-security',
                    component: () => import('../pages/settings/SecurityPage.vue'),
                    meta: { requiresAuth: true },
                },
                ...[
                    { path: 'customers/new', title: 'New client' },
                    { path: 'documents', title: 'Documents' },
                    { path: 'team', title: 'Team' },
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
    if (to.meta.requiresAuth && !authStore.isLoggedIn) {
        next({ path: '/login', query: { redirect: to.fullPath } });
    } else {
        next();
    }
});
