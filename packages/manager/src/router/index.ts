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
                ...[
                    { path: 'orders/new', title: 'New order' },
                    { path: 'orders/:code', title: 'Order detail' },
                    { path: 'customers', title: 'Customers' },
                    { path: 'customers/new', title: 'New client' },
                    { path: 'catalog', title: 'Catalog' },
                    { path: 'discounts', title: 'Discounts' },
                    { path: 'approvals', title: 'Approvals' },
                    { path: 'documents', title: 'Documents' },
                    { path: 'team', title: 'Team' },
                    { path: 'settings', title: 'Settings' },
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
